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
