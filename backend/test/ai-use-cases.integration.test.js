const test = require('node:test');
const assert = require('node:assert/strict');

test(
  'AI settings persist with encrypted keys, isolate users, and cascade on account deletion',
  { skip: process.env.RUN_LOCAL_DB_TESTS !== '1' },
  async () => {
    const pool = require('../config/db');
    const {
      saveUseCase: saveReal,
      listUseCases,
      resolveUseCase,
    } = require('../services/aiUseCases');
    const saveUseCase = (...args) => saveReal(...args, async () => {});
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        "INSERT INTO users(email,name) VALUES(gen_random_uuid() || '@example.invalid','AI settings test'),(gen_random_uuid() || '@example.invalid','AI settings isolation test') RETURNING id",
      );
      const [alice, bob] = rows.map((row) => row.id);
      const body = {
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        keyMode: 'personal',
        apiKey: 'synthetic-test-key-only',
      };
      await saveUseCase(client, alice, 'voice_chat', body);
      await saveUseCase(client, alice, 'voice_chat', {
        ...body,
        apiKey: undefined,
        model: 'gemini-2.5-pro',
      });
      const result = await resolveUseCase(client, alice, 'voice_chat');
      assert.equal(result.model, 'gemini-2.5-pro');
      assert.equal(result.apiKey, body.apiKey);
      const stored = await client.query(
        'SELECT encrypted_key FROM user_ai_use_cases WHERE user_id=$1',
        [alice],
      );
      assert.notEqual(stored.rows[0].encrypted_key, body.apiKey);
      const visible = JSON.stringify(await listUseCases(client, alice));
      assert.ok(!visible.includes(body.apiKey));
      assert.ok(!visible.includes('encrypted_key'));
      assert.ok((await listUseCases(client, bob)).every((item) => item.setting === null));
      await saveUseCase(client, bob, 'voice_chat', { clear: true });
      assert.equal((await resolveUseCase(client, alice, 'voice_chat')).apiKey, body.apiKey);
      await saveUseCase(client, alice, 'voice_chat', {
        ...body,
        apiKey: undefined,
        keyMode: 'admin',
      });
      const cleared = await client.query(
        'SELECT encrypted_key FROM user_ai_use_cases WHERE user_id=$1',
        [alice],
      );
      assert.equal(cleared.rows[0].encrypted_key, null);
      await client.query('DELETE FROM users WHERE id=$1', [alice]);
      assert.equal(
        (await client.query('SELECT 1 FROM user_ai_use_cases WHERE user_id=$1', [alice])).rowCount,
        0,
      );
    } finally {
      await client.query('ROLLBACK');
      client.release();
      await pool.end();
    }
  },
);
