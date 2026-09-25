const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveUseCase,
  saveUseCase: saveReal,
  listUseCases,
  USE_CASES,
} = require('../services/aiUseCases');
const saveUseCase = (...args) => saveReal(...args, async () => {});
const { decrypt } = require('../services/crypto');

function memoryPool() {
  const settings = new Map();
  const keys = new Map();
  return {
    settings,
    keys,
    async query(sql, p) {
      const id = `${p[0]}:${p[1]}`;
      if (sql.startsWith('INSERT INTO user_ai_use_cases')) {
        settings.set(id, {
          use_case: p[1],
          provider: p[2],
          model: p[3],
          key_mode: p[4],
          encrypted_key: p[5],
          key_hint: p[6],
        });
        return { rows: [] };
      }
      if (sql.startsWith('DELETE FROM user_ai_use_cases')) {
        settings.delete(id);
        return { rows: [] };
      }
      if (sql.includes('FROM user_ai_use_cases')) {
        if (p.length === 1)
          return {
            rows: [...settings.entries()]
              .filter(([key]) => key.startsWith(`${p[0]}:`))
              .map(([, row]) => {
                const { encrypted_key, ...safe } = row;
                return safe;
              }),
          };
        const row = settings.get(id);
        return {
          rows:
            row && (p.length < 3 || (row.provider === p[2] && row.key_mode === p[3])) ? [row] : [],
        };
      }
      if (sql.includes('FROM user_ai_keys'))
        return { rows: keys.has(id) ? [{ id: 'key-id', encrypted_key: keys.get(id) }] : [] };
      if (sql.includes('FROM users'))
        return {
          rows: [
            {
              selected_ai_provider: 'gemini',
              selected_ai_model: 'gemini-2.5-flash',
              ai_key_mode: 'personal',
            },
          ],
        };
      throw new Error(`Unexpected test query: ${sql}`);
    },
  };
}

test('each feature resolves its own provider, model and encrypted key without crossing users', async () => {
  const pool = memoryPool();
  for (const [i, useCase] of USE_CASES.entries()) {
    await saveUseCase(pool, 'alice', useCase.id, {
      provider: 'gemini',
      model: i % 2 ? 'gemini-2.5-pro' : 'gemini-2.5-flash',
      keyMode: 'personal',
      apiKey: `secret-for-${useCase.id}`,
    });
    const setting = await resolveUseCase(pool, 'alice', useCase.id);
    assert.equal(setting.apiKey, `secret-for-${useCase.id}`);
    assert.equal(setting.model, i % 2 ? 'gemini-2.5-pro' : 'gemini-2.5-flash');
    assert.notEqual(pool.settings.get(`alice:${useCase.id}`).encrypted_key, setting.apiKey);
  }
  await assert.rejects(() => resolveUseCase(pool, 'bob', 'voice_chat'), /not configured/);
  const response = JSON.stringify(await listUseCases(pool, 'alice'));
  assert.ok(!response.includes('encrypted_key'));
  assert.ok(!response.includes('secret-for-'));
});

test('dedicated key can be retained, replaced, and removed without changing another feature', async () => {
  const pool = memoryPool();
  const config = { provider: 'gemini', model: 'gemini-2.5-flash', keyMode: 'personal' };
  await saveUseCase(pool, 'alice', 'voice_chat', { ...config, apiKey: 'original-key' });
  await saveUseCase(pool, 'alice', 'text_chat', { ...config, apiKey: 'separate-key' });
  await saveUseCase(pool, 'alice', 'voice_chat', { ...config, model: 'gemini-2.5-pro' });
  assert.equal((await resolveUseCase(pool, 'alice', 'voice_chat')).apiKey, 'original-key');
  await saveUseCase(pool, 'alice', 'voice_chat', { ...config, apiKey: 'replacement-key' });
  assert.equal(decrypt(pool.settings.get('alice:voice_chat').encrypted_key), 'replacement-key');
  await saveUseCase(pool, 'alice', 'voice_chat', { ...config, keyMode: 'admin' });
  assert.equal(pool.settings.get('alice:voice_chat').encrypted_key, null);
  assert.equal((await resolveUseCase(pool, 'alice', 'voice_chat')).apiKey, null);
  assert.equal((await resolveUseCase(pool, 'alice', 'text_chat')).apiKey, 'separate-key');
});

test('disconnect removes only this feature and never inherits defaults', async () => {
  const pool = memoryPool();
  const config = {
    provider: 'gemini',
    model: 'gemini-2.5-pro',
    keyMode: 'personal',
    apiKey: 'dedicated-key',
  };
  await saveUseCase(pool, 'alice', 'voice_chat', config);
  await saveUseCase(pool, 'alice', 'text_chat', config);
  await assert.rejects(() => saveUseCase(pool, 'alice', 'voice_chat', { inherit: true }), {
    status: 400,
  });
  await saveUseCase(pool, 'bob', 'voice_chat', { clear: true });
  assert.equal(pool.settings.size, 2);
  await saveUseCase(pool, 'alice', 'voice_chat', { clear: true });
  assert.equal(pool.settings.size, 1);
  await assert.rejects(() => resolveUseCase(pool, 'alice', 'voice_chat'), {
    code: 'AI_SETUP_REQUIRED',
  });
});

test('failed validation preserves prior connection and checks exact candidate', async () => {
  const pool = memoryPool();
  const config = {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    keyMode: 'personal',
    apiKey: 'original-key',
  };
  await saveUseCase(pool, 'alice', 'text_chat', config);
  await assert.rejects(
    () =>
      saveReal(
        pool,
        'alice',
        'text_chat',
        { ...config, apiKey: 'replacement-key' },
        async (candidate) => {
          assert.deepEqual(candidate, {
            providerId: 'gemini',
            model: config.model,
            apiKey: 'replacement-key',
          });
          throw new Error('validation rejected');
        },
      ),
    /validation rejected/,
  );
  assert.equal((await resolveUseCase(pool, 'alice', 'text_chat')).apiKey, 'original-key');
  pool.settings.get('alice:text_chat').encrypted_key = 'corrupt';
  await assert.rejects(() => resolveUseCase(pool, 'alice', 'text_chat'), /decrypt/);
  pool.settings.get('alice:text_chat').encrypted_key = null;
  await assert.rejects(() => resolveUseCase(pool, 'alice', 'text_chat'), /no personal key/);
});

test('rejects unknown features, model/provider mismatch, missing keys and malformed inputs', async () => {
  const pool = memoryPool();
  const config = {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    keyMode: 'personal',
    apiKey: 'valid-key-value',
  };
  for (const body of [
    { ...config, provider: 'constructor' },
    { ...config, model: 'claude-3-7-sonnet-20250219' },
    { ...config, keyMode: 'unknown' },
    { ...config, apiKey: 'tiny' },
    { ...config, apiKey: 'x'.repeat(4097) },
    { ...config, apiKey: undefined },
    { ...config, keyMode: 'saved', apiKey: undefined },
    { ...config, keyMode: 'admin' },
  ])
    await assert.rejects(() => saveUseCase(pool, 'alice', 'voice_chat', body), { status: 400 });
  await assert.rejects(() => saveUseCase(pool, 'alice', 'unknown', config), { status: 400 });
  await assert.rejects(() => resolveUseCase(pool, 'alice', 'unknown'), { status: 400 });
  assert.equal(pool.settings.size, 0);
});
