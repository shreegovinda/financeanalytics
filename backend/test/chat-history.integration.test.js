const test = require('node:test');
const assert = require('node:assert/strict');
test(
  'saved history pages, isolates users and cannot reappear after deletion',
  { skip: process.env.RUN_LOCAL_DB_TESTS !== '1' },
  async () => {
    const pool = require('../config/db');
    const history = require('../services/chatHistory');
    const ids = [];
    try {
      for (let i = 0; i < 2; i++)
        ids.push(
          (
            await pool.query(
              "INSERT INTO users(email,name) VALUES(gen_random_uuid() || '@example.invalid','History test') RETURNING id",
            )
          ).rows[0].id,
        );
      const first = await history.createConversation(pool, ids[0], 'First chat');
      const second = await history.createConversation(pool, ids[0], 'Second chat');
      await history.save(pool, ids[0], 0, 'First question', { answer: 'First answer' }, first.id);
      await history.save(
        pool,
        ids[0],
        0,
        'Second question',
        { answer: 'Second answer' },
        second.id,
      );
      assert.equal(
        (await history.page(pool, ids[0], undefined, first.id)).messages[0].content,
        'First question',
      );
      await assert.rejects(history.page(pool, ids[1], undefined, first.id), { status: 404 });
      await assert.rejects(history.deleteConversation(pool, ids[1], first.id), { status: 404 });
      const storedTitle = (
        await pool.query('SELECT title FROM chat_conversations WHERE id=$1', [first.id])
      ).rows[0].title;
      assert.notEqual(storedTitle, 'First chat');
      assert.equal((await history.conversations(pool, ids[0])).length, 2);
      await history.deleteConversation(pool, ids[0], first.id);
      await assert.rejects(history.save(pool, ids[0], 0, 'late', { answer: 'late' }, first.id), {
        status: 404,
      });
      assert.equal((await history.page(pool, ids[0], undefined, second.id)).messages.length, 2);
      assert.equal(
        (await pool.query('SELECT 1 FROM chat_messages WHERE conversation_id=$1', [first.id]))
          .rowCount,
        0,
      );
      await history.deleteConversation(pool, ids[0], second.id);
      for (let i = 0; i < 51; i++)
        await history.save(pool, ids[0], 0, 'Question ' + i, {
          answer: 'Answer ' + i,
          evidence: [],
        });
      await history.save(pool, ids[1], 0, 'Private question', { answer: 'Private answer' });
      const latest = await history.page(pool, ids[0]);
      assert.equal(latest.messages.length, 100);
      assert.equal(latest.messages.at(-1).content, 'Answer 50');
      const older = await history.page(pool, ids[0], latest.before);
      assert.equal(older.messages.length, 2);
      assert.equal(older.messages[0].content, 'Question 0');
      assert.equal(older.before, null);
      const version = await history.version(pool, ids[0]);
      await history.remove(pool, ids[0]);
      assert.equal(await history.save(pool, ids[0], version, 'late', { answer: 'late' }), false);
      assert.equal((await history.page(pool, ids[0])).messages.length, 0);
      assert.equal((await history.page(pool, ids[1])).messages.length, 2);
    } finally {
      await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [ids]);
      await pool.end();
    }
  },
);
