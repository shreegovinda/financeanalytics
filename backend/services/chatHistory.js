const { encrypt, safeDecrypt, encryptJson, decryptJson } = require('./crypto');

async function page(pool, userId, before, conversationId) {
  if (conversationId !== undefined) await requireConversation(pool, userId, conversationId);
  if (before !== undefined && !/^[1-9][0-9]{0,18}$/.test(String(before))) {
    const error = new Error('Invalid history cursor.');
    error.status = 400;
    throw error;
  }
  const { rows } = await pool.query(
    `SELECT role, content, result, sequence, created_at FROM chat_messages WHERE user_id=$1 AND ($2::bigint IS NULL OR sequence<$2) ${conversationId !== undefined ? 'AND conversation_id IS NOT DISTINCT FROM $3::uuid' : ''} ORDER BY sequence DESC LIMIT 101`,
    conversationId !== undefined
      ? [userId, before || null, conversationId === 'legacy' ? null : conversationId]
      : [userId, before || null],
  );
  const messages = rows
    .slice(0, 100)
    .reverse()
    .map((m) => {
      let res = m.result;
      if (res && res.encrypted) {
        try {
          res = decryptJson(res.encrypted);
        } catch (e) {
          console.error('Failed to decrypt chat message result:', e);
        }
      }
      return {
        ...m,
        content: safeDecrypt(m.content),
        result: res,
        created_at: m.created_at,
      };
    });
  return { messages, before: rows.length > 100 ? String(messages[0].sequence) : null };
}
async function version(pool, userId) {
  return (await pool.query('SELECT chat_history_version FROM users WHERE id=$1', [userId])).rows[0]
    .chat_history_version;
}
async function mutate(pool, userId, action) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT chat_history_version FROM users WHERE id=$1 FOR UPDATE',
      [userId],
    );
    const result = await action(client, rows[0].chat_history_version);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
async function remove(pool, userId) {
  return mutate(pool, userId, async (client) => {
    await client.query('UPDATE users SET chat_history_version=chat_history_version+1 WHERE id=$1', [
      userId,
    ]);
    await client.query('DELETE FROM chat_messages WHERE user_id=$1', [userId]);
    await client.query('DELETE FROM chat_conversations WHERE user_id=$1', [userId]);
  });
}
async function save(pool, userId, expectedVersion, question, result, conversationId) {
  return mutate(pool, userId, async (client, currentVersion) => {
    if (conversationId !== undefined) await requireConversation(client, userId, conversationId);
    if ((!conversationId || conversationId === 'legacy') && currentVersion !== expectedVersion)
      return false;
    const encQuestion = encrypt(question);
    const encAnswer = encrypt(result.answer || '');
    const encResult = JSON.stringify({ encrypted: encryptJson(result) });
    await client.query(
      conversationId && conversationId !== 'legacy'
        ? "INSERT INTO chat_messages(user_id,role,content,result,conversation_id) VALUES($1,'user',$2,NULL,$5),($1,'assistant',$3,$4,$5)"
        : "INSERT INTO chat_messages(user_id,role,content,result) VALUES($1,'user',$2,NULL),($1,'assistant',$3,$4)",
      conversationId && conversationId !== 'legacy'
        ? [userId, encQuestion, encAnswer, encResult, conversationId]
        : [userId, encQuestion, encAnswer, encResult],
    );
    if (conversationId && conversationId !== 'legacy')
      await client.query(
        'UPDATE chat_conversations SET updated_at=NOW() WHERE id=$1 AND user_id=$2',
        [conversationId, userId],
      );
    return true;
  });
}
function invalidChat() {
  return Object.assign(new Error('Conversation not found.'), { status: 404 });
}
async function requireConversation(pool, userId, id) {
  if (id === 'legacy') return;
  if (
    typeof id !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    throw invalidChat();
  const { rows } = await pool.query(
    'SELECT id FROM chat_conversations WHERE user_id=$1 AND id=$2',
    [userId, id],
  );
  if (!rows.length) throw invalidChat();
}
async function conversations(pool, userId) {
  const { rows } = await pool.query(
    'SELECT id,title,created_at,updated_at FROM chat_conversations WHERE user_id=$1 ORDER BY updated_at DESC',
    [userId],
  );
  const legacy = await pool.query(
    'SELECT MAX(created_at) AS updated_at FROM chat_messages WHERE user_id=$1 AND conversation_id IS NULL',
    [userId],
  );
  return [
    ...rows.map((row) => ({ ...row, title: safeDecrypt(row.title) })),
    ...(legacy.rows[0]?.updated_at
      ? [{ id: 'legacy', title: 'Saved history', updated_at: legacy.rows[0].updated_at }]
      : []),
  ];
}
async function createConversation(pool, userId, title) {
  const { rows } = await pool.query(
    'INSERT INTO chat_conversations(user_id,title) VALUES($1,$2) RETURNING id,created_at,updated_at',
    [
      userId,
      encrypt(
        String(title || 'New chat')
          .trim()
          .slice(0, 80) || 'New chat',
      ),
    ],
  );
  return {
    ...rows[0],
    title:
      String(title || 'New chat')
        .trim()
        .slice(0, 80) || 'New chat',
  };
}
async function deleteConversation(pool, userId, id) {
  return mutate(pool, userId, async (client) => {
    await requireConversation(client, userId, id);
    if (id === 'legacy') {
      await client.query(
        'UPDATE users SET chat_history_version=chat_history_version+1 WHERE id=$1',
        [userId],
      );
      await client.query('DELETE FROM chat_messages WHERE user_id=$1 AND conversation_id IS NULL', [
        userId,
      ]);
    } else
      await client.query('DELETE FROM chat_conversations WHERE user_id=$1 AND id=$2', [userId, id]);
  });
}
module.exports = {
  page,
  version,
  remove,
  save,
  requireConversation,
  conversations,
  createConversation,
  deleteConversation,
};
