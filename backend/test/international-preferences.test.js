const assert = require('node:assert/strict');
const test = require('node:test');

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

function loadAuthRouter(pool) {
  const authPath = require.resolve('../routes/auth');
  const originalAuth = require.cache[authPath];
  delete require.cache[authPath];

  const restoreDb = mockModule('../config/db', pool);
  const restoreAuth = mockModule('../middleware/auth', (req, _res, next) => next());

  const router = require('../routes/auth');

  return {
    router,
    cleanup() {
      delete require.cache[authPath];
      if (originalAuth) {
        require.cache[authPath] = originalAuth;
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

test('GET /me returns user international preferences and configured AI keys', async () => {
  const mockPool = {
    async query(sql, params) {
      if (sql.includes('FROM users WHERE id = $1')) {
        return {
          rows: [
            {
              id: params[0],
              email: 'user@example.com',
              name: 'John Doe',
              phone: '+919876543210',
              locale: 'en-IN',
              timezone: 'Asia/Kolkata',
              currency: 'INR',
              language: 'en',
              date_format: 'DD/MM/YYYY',
              time_format: '12h',
              selected_ai_provider: 'gemini',
              selected_ai_model: 'gemini-2.5-flash',
              ai_key_mode: 'admin',
            },
          ],
        };
      }
      if (sql.includes('FROM user_ai_keys WHERE user_id = $1')) {
        return {
          rows: [
            {
              provider: 'gemini',
              key_hint: 'AIza...9876',
              updated_at: '2026-09-12T00:00:00.000Z',
            },
          ],
        };
      }
      return { rows: [] };
    },
  };

  const { router, cleanup } = loadAuthRouter(mockPool);

  try {
    const res = await invokeRoute(router, 'GET', '/me', {
      user: { id: 'test-user-id' },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.user.currency, 'INR');
    assert.equal(res.body.user.timezone, 'Asia/Kolkata');
    assert.equal(res.body.user.locale, 'en-IN');
    assert.equal(res.body.user.language, 'en');
    assert.equal(res.body.user.date_format, 'DD/MM/YYYY');
    assert.equal(res.body.user.time_format, '12h');
    assert.equal(res.body.user.configuredAiKeys.length, 1);
    assert.equal(res.body.user.configuredAiKeys[0].provider, 'gemini');
    assert.equal(res.body.user.configuredAiKeys[0].keyHint, 'AIza...9876');
  } finally {
    cleanup();
  }
});

test('PUT /me successfully updates international preferences and currency', async () => {
  let updatedValues = null;
  const mockPool = {
    async query(sql, params) {
      if (sql.includes('SELECT phone, name, locale')) {
        return {
          rows: [
            {
              name: 'John Doe',
              phone: '+919876543210',
              locale: 'en-IN',
              timezone: 'Asia/Kolkata',
              currency: 'INR',
              language: 'en',
              date_format: 'DD/MM/YYYY',
              time_format: '12h',
              selected_ai_provider: 'gemini',
              selected_ai_model: 'gemini-2.5-flash',
              ai_key_mode: 'admin',
            },
          ],
        };
      }
      if (sql.includes('UPDATE users')) {
        updatedValues = params;
        return {
          rows: [
            {
              id: params[12],
              email: 'user@example.com',
              name: params[0],
              phone: params[1],
              locale: params[3],
              timezone: params[4],
              currency: params[5],
              language: params[6],
              date_format: params[7],
              time_format: params[8],
              selected_ai_provider: params[9],
              selected_ai_model: params[10],
              ai_key_mode: params[11],
            },
          ],
        };
      }
      if (sql.includes('FROM user_ai_keys WHERE user_id = $1')) {
        return { rows: [] };
      }
      return { rows: [] };
    },
  };

  const { router, cleanup } = loadAuthRouter(mockPool);

  try {
    const res = await invokeRoute(router, 'PUT', '/me', {
      user: { id: 'test-user-id' },
      body: {
        currency: 'USD',
        timezone: 'America/New_York',
        locale: 'en-US',
        language: 'en',
        date_format: 'DD MMM YYYY',
        time_format: '24h',
      },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.user.currency, 'USD');
    assert.equal(res.body.user.timezone, 'America/New_York');
    assert.equal(res.body.user.locale, 'en-US');
    assert.equal(res.body.user.date_format, 'DD MMM YYYY');
    assert.equal(res.body.user.time_format, '24h');
  } finally {
    cleanup();
  }
});

test('PUT /me rejects invalid currency, timezone, or locale formats', async () => {
  const mockPool = {
    async query(sql) {
      if (sql.includes('SELECT phone, name, locale')) {
        return {
          rows: [
            {
              name: 'John Doe',
              phone: '+919876543210',
              locale: 'en-IN',
              timezone: 'Asia/Kolkata',
              currency: 'INR',
              language: 'en',
            },
          ],
        };
      }
      return { rows: [] };
    },
  };

  const { router, cleanup } = loadAuthRouter(mockPool);

  try {
    // Bad currency
    const resBadCurrency = await invokeRoute(router, 'PUT', '/me', {
      user: { id: 'test-user-id' },
      body: { currency: 'INVALID_LONG_CODE' },
    });
    assert.equal(resBadCurrency.statusCode, 400);
    assert.match(resBadCurrency.body.error, /3-letter ISO code/);

    // Bad timezone
    const resBadTz = await invokeRoute(router, 'PUT', '/me', {
      user: { id: 'test-user-id' },
      body: { timezone: 'Fake/Not_A_Timezone' },
    });
    assert.equal(resBadTz.statusCode, 400);
    assert.match(resBadTz.body.error, /Invalid IANA timezone/);

    // Bad locale
    const resBadLocale = await invokeRoute(router, 'PUT', '/me', {
      user: { id: 'test-user-id' },
      body: { locale: '---bad---' },
    });
    assert.equal(resBadLocale.statusCode, 400);
    assert.match(resBadLocale.body.error, /Invalid locale tag/);
  } finally {
    cleanup();
  }
});
