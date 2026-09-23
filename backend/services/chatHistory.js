const { encrypt, safeDecrypt, encryptJson, decryptJson } = require('./crypto');

async function page(pool, userId, before) {
  if (before !== undefined && !/^[1-9][0-9]{0,18}$/.test(String(before))) {
    const error = new Error('Invalid history cursor.');
    error.status = 400;
    throw error;
  }
  const { rows } = await pool.query(
    'SELECT role, content, result, sequence, created_at FROM chat_messages WHERE user_id=$1 AND ($2::bigint IS NULL OR sequence<$2) ORDER BY sequence DESC LIMIT 101',
    [userId, before || null],
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
  });
}
async function save(pool, userId, expectedVersion, question, result) {
  return mutate(pool, userId, async (client, currentVersion) => {
    if (currentVersion !== expectedVersion) return false;
    const encQuestion = encrypt(question);
    const encAnswer = encrypt(result.answer || '');
    const encResult = JSON.stringify({ encrypted: encryptJson(result) });
    await client.query(
      "INSERT INTO chat_messages(user_id,role,content,result) VALUES($1,'user',$2,NULL),($1,'assistant',$3,$4)",
      [userId, encQuestion, encAnswer, encResult],
    );
    return true;
  });
}
module.exports = { page, version, remove, save };
