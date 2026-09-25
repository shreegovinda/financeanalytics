const assert = require('node:assert/strict');
const test = require('node:test');
const { encrypt } = require('../services/crypto');
const { getUserAiExecutionConfig } = require('../services/ai');
test('provider overrides resolve a matching model and personal key together', async () => {
  const pool = {
    async query(sql, params) {
      if (sql.includes('FROM users'))
        return {
          rows: [
            {
              selected_ai_provider: 'anthropic',
              selected_ai_model: 'claude-test',
              ai_key_mode: 'personal',
            },
          ],
        };
      assert.equal(params[1], 'gemini');
      return { rows: [{ encrypted_key: encrypt('fake-gemini-key') }] };
    },
  };
  const config = await getUserAiExecutionConfig(pool, 'test-user', 'gemini');
  assert.equal(config.providerId, 'gemini');
  assert.equal(config.apiKey, 'fake-gemini-key');
  assert.notEqual(config.model, 'claude-test');
});

function mockModule(modulePath, exports) {
  const resolvedPath = require.resolve(modulePath);
  const originalModule = require.cache[resolvedPath];

  require.cache[resolvedPath] = {
    id: resolvedPath,
    filename: resolvedPath,
    loaded: true,
    exports,
  };

  return () => {
    if (originalModule) {
      require.cache[resolvedPath] = originalModule;
    } else {
      delete require.cache[resolvedPath];
    }
  };
}

function loadAiRouter(pool) {
  const aiPath = require.resolve('../routes/ai');
  const originalAi = require.cache[aiPath];
  delete require.cache[aiPath];

  const restoreDb = mockModule('../config/db', pool);
  const restoreAuth = mockModule('../middleware/auth', (req, _res, next) => next());

  const router = require('../routes/ai');

  return {
    router,
    cleanup() {
      delete require.cache[aiPath];
      if (originalAi) {
        require.cache[aiPath] = originalAi;
      }
      restoreDb();
      restoreAuth();
    },
  };
}

function createMockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
}

async function invokeRoute(router, method, path, req) {
  const route = router.stack.find(
    (layer) =>
      layer.route && layer.route.path === path && layer.route.methods[method.toLowerCase()],
  );

  if (!route) {
    throw new Error(`Route not found: ${method} ${path}`);
  }

  const res = createMockRes();
  const handlers = route.route.stack.map((layer) => layer.handle);

  let idx = 0;
  const next = async (err) => {
    if (err) throw err;
    if (idx < handlers.length) {
      const handler = handlers[idx++];
      await handler(req, res, next);
    }
  };

  await next();
  return res;
}

test('GET /api/ai/catalogue returns providers, models, and personal key hints', async () => {
  const mockPool = {
    async query(sql, params) {
      if (sql.includes('FROM users WHERE id = $1')) {
        return {
          rows: [
            {
              selected_ai_provider: 'anthropic',
              selected_ai_model: 'claude-3-5-sonnet-20241022',
              ai_key_mode: 'personal',
            },
          ],
        };
      }
      if (sql.includes('FROM user_ai_keys WHERE user_id = $1')) {
        return {
          rows: [
            {
              provider: 'anthropic',
              key_hint: 'sk-a...9876',
              updated_at: '2026-09-12T00:00:00.000Z',
            },
          ],
        };
      }
      return { rows: [] };
    },
  };

  const { router, cleanup } = loadAiRouter(mockPool);

  try {
    const res = await invokeRoute(router, 'GET', '/catalogue', {
      user: { id: 'test-user-id' },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.currentPreferences.provider, 'anthropic');
    assert.equal(res.body.currentPreferences.keyMode, 'personal');

    const anthropicProv = res.body.catalogue.providers.find((p) => p.id === 'anthropic');
    assert.ok(anthropicProv);
    assert.equal(anthropicProv.userKeyConfigured, true);
    assert.equal(anthropicProv.keyHint, 'sk-a...9876');
  } finally {
    cleanup();
  }
});

test('POST /api/ai/keys encrypts key and returns hint without cleartext', async () => {
  let storedEncryptedKey = null;
  const mockPool = {
    async query(sql, params) {
      if (sql.includes('INSERT INTO user_ai_keys')) {
        storedEncryptedKey = params[2]; // encrypted_key
        return { rows: [] };
      }
      return { rows: [] };
    },
  };

  const { router, cleanup } = loadAiRouter(mockPool);

  try {
    const rawKey = 'sk-ant-api03-live-test-key-for-user-anthropic';
    const res = await invokeRoute(router, 'POST', '/keys', {
      user: { id: 'test-user-id' },
      body: {
        provider: 'anthropic',
        apiKey: rawKey,
      },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.keyHint, 'sk-a...opic');
    // Ensure response NEVER contains rawKey
    assert.equal(JSON.stringify(res.body).includes(rawKey), false);

    // Verify stored key in DB is encrypted
    assert.ok(storedEncryptedKey);
    assert.notEqual(storedEncryptedKey, rawKey);
    assert.match(storedEncryptedKey, /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
  } finally {
    cleanup();
  }
});

test('getUserAiExecutionConfig strictly guards against fallback to admin key', async () => {
  // Scenario 1: User chose personal key mode, but no key exists in user_ai_keys
  const mockPoolMissingKey = {
    async query(sql) {
      if (sql.includes('FROM users WHERE id = $1')) {
        return {
          rows: [
            {
              selected_ai_provider: 'anthropic',
              selected_ai_model: 'claude-3-5-sonnet-20241022',
              ai_key_mode: 'personal',
            },
          ],
        };
      }
      if (sql.includes('FROM user_ai_keys WHERE user_id = $1')) {
        return { rows: [] }; // No key
      }
      return { rows: [] };
    },
  };

  await assert.rejects(
    () => getUserAiExecutionConfig(mockPoolMissingKey, 'test-user-id'),
    /Personal API key mode is enabled for anthropic, but no personal key has been saved/,
  );

  // Scenario 2: User has personal key configured and saved
  const secretKey = 'sk-ant-test-key-12345678';
  const encrypted = encrypt(secretKey);

  const mockPoolWithKey = {
    async query(sql) {
      if (sql.includes('FROM users WHERE id = $1')) {
        return {
          rows: [
            {
              selected_ai_provider: 'anthropic',
              selected_ai_model: 'claude-3-5-sonnet-20241022',
              ai_key_mode: 'personal',
            },
          ],
        };
      }
      if (sql.includes('FROM user_ai_keys WHERE user_id = $1')) {
        return {
          rows: [{ encrypted_key: encrypted }],
        };
      }
      return { rows: [] };
    },
  };

  const config = await getUserAiExecutionConfig(mockPoolWithKey, 'test-user-id');
  assert.equal(config.providerId, 'anthropic');
  assert.equal(config.keyMode, 'personal');
  assert.equal(config.apiKey, secretKey);
});
