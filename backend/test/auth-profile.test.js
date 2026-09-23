const assert = require('node:assert/strict');
const test = require('node:test');
const { safeDecrypt, computeBlindIndex } = require('../services/crypto');
const { normalizePhoneNumber } = require('../services/whatsappService');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-12345678901234567890';

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

function getRouteHandler(router, method, path) {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === path && l.route.methods[method.toLowerCase()],
  );
  if (!layer) throw new Error(`Route handler not found for ${method} ${path}`);
  return layer.route.stack.at(-1).handle;
}

test('GET /me reports needsPhone: true when user has no phone', async () => {
  const pool = {
    async query(_sql, params) {
      assert.deepEqual(params, ['user-1']);
      return {
        rows: [{ id: 'user-1', email: 'user@example.com', name: 'Existing User', phone: null }],
      };
    },
  };

  const { router, cleanup } = loadAuthRouter(pool);
  try {
    const handler = getRouteHandler(router, 'GET', '/me');
    const req = { user: { id: 'user-1' } };
    const res = createMockRes();

    await handler(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.user.needsPhone, true);
    assert.equal(res.body.user.phone, null);
  } finally {
    cleanup();
  }
});

test('GET /me reports needsPhone: false when user has a phone', async () => {
  const pool = {
    async query(_sql, params) {
      assert.deepEqual(params, ['user-1']);
      return {
        rows: [
          {
            id: 'user-1',
            email: 'user@example.com',
            name: 'Existing User',
            phone: '+919876543210',
          },
        ],
      };
    },
  };

  const { router, cleanup } = loadAuthRouter(pool);
  try {
    const handler = getRouteHandler(router, 'GET', '/me');
    const req = { user: { id: 'user-1' } };
    const res = createMockRes();

    await handler(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.user.needsPhone, false);
    assert.equal(res.body.user.phone, '+919876543210');
  } finally {
    cleanup();
  }
});

test('PUT /me rejects invalid mobile formats with HTTP 400', async () => {
  const invalidPhones = ['9876543210', '+0123456789', 'invalid', '+91', '+12345678901234567'];

  for (const phone of invalidPhones) {
    const pool = {
      async query() {
        return { rows: [{ phone: null }] };
      },
    };

    const { router, cleanup } = loadAuthRouter(pool);
    try {
      const handler = getRouteHandler(router, 'PUT', '/me');
      const req = { user: { id: 'user-1' }, body: { name: 'User', phone } };
      const res = createMockRes();

      await handler(req, res);
      assert.equal(res.statusCode, 400, `Expected 400 for phone "${phone}"`);
      assert.match(res.body.error, /mobile number with country code is required/);
    } finally {
      cleanup();
    }
  }
});

test('PUT /me requires mobile number when existing user has no phone', async () => {
  const pool = {
    async query() {
      return { rows: [{ phone: null }] };
    },
  };

  const { router, cleanup } = loadAuthRouter(pool);
  try {
    const handler = getRouteHandler(router, 'PUT', '/me');
    const req = { user: { id: 'user-1' }, body: { name: 'User' } };
    const res = createMockRes();

    await handler(req, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /mobile number with country code is required/);
  } finally {
    cleanup();
  }
});

test('PUT /me accepts valid international mobile number and saves trimmed value', async () => {
  let updatedParams = null;
  const pool = {
    async query(sql, params) {
      if (sql.includes('SELECT phone')) {
        return { rows: [{ phone: null }] };
      }
      if (sql.includes('UPDATE users')) {
        updatedParams = params;
        return {
          rows: [
            {
              id: params[3],
              email: 'user@example.com',
              name: params[0],
              phone: params[1],
            },
          ],
        };
      }
      return { rows: [] };
    },
  };

  const { router, cleanup } = loadAuthRouter(pool);
  try {
    const handler = getRouteHandler(router, 'PUT', '/me');
    const req = {
      user: { id: 'user-1' },
      body: { name: '  Updated Name  ', phone: '  +919876543210  ' },
    };
    const res = createMockRes();

    await handler(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(safeDecrypt(updatedParams[0]), 'Updated Name');
    assert.equal(safeDecrypt(updatedParams[1]), '+919876543210');
    assert.equal(updatedParams[2], computeBlindIndex(normalizePhoneNumber('+919876543210')));
    assert.equal(updatedParams[3], 'user-1');
    assert.equal(res.body.user.name, 'Updated Name');
    assert.equal(res.body.user.phone, '+919876543210');
    assert.equal(res.body.user.needsPhone, false);
  } finally {
    cleanup();
  }
});

test('POST /register rejects registration without explicit consent', async () => {
  const pool = {
    async query() {
      return { rows: [] };
    },
  };

  const { router, cleanup } = loadAuthRouter(pool);
  try {
    const handler = getRouteHandler(router, 'POST', '/register');
    const req = {
      body: {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
        phone: '+919876543210',
        consentGiven: false,
      },
    };
    const res = createMockRes();

    await handler(req, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /You must agree to the Terms of Service/);
  } finally {
    cleanup();
  }
});

test('POST /register records policy consent when valid consent is provided', async () => {
  const recordedConsents = [];
  const pool = {
    async query(sql, params) {
      if (sql.includes('SELECT * FROM users')) {
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO users')) {
        return {
          rows: [
            {
              id: 'new-user-1',
              email: params[0],
              name: params[2],
              phone: params[3],
              token_version: 0,
              email_verified: false,
            },
          ],
        };
      }
      if (sql.includes('INSERT INTO user_consents')) {
        recordedConsents.push(params);
        return { rows: [{ id: 'consent-1' }] };
      }
      return { rows: [] };
    },
  };

  // Mock issueVerification so no mail transport is needed
  const restoreVerify = mockModule('../services/emailVerification', {
    issueVerification: async () => {},
  });

  const { router, cleanup } = loadAuthRouter(pool);
  try {
    const handler = getRouteHandler(router, 'POST', '/register');
    const req = {
      ip: '127.0.0.1',
      get: (header) => (header === 'User-Agent' ? 'TestBrowser/1.0' : undefined),
      body: {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
        phone: '+919876543210',
        consentGiven: true,
      },
    };
    const res = createMockRes();

    await handler(req, res);
    assert.equal(res.statusCode, 201);
    assert.equal(recordedConsents.length, 1);
    assert.equal(recordedConsents[0][0], 'new-user-1');
    assert.equal(recordedConsents[0][1], '2026-09-12');
    assert.equal(recordedConsents[0][2], '127.0.0.1');
    assert.equal(recordedConsents[0][3], 'TestBrowser/1.0');
  } finally {
    restoreVerify();
    cleanup();
  }
});

test('PUT /me rejects invalid email format with HTTP 400', async () => {
  const pool = {
    async query(sql) {
      if (sql.includes('SELECT phone')) {
        return { rows: [{ id: 'user-1', email: 'old@example.com', phone: '+919876543210' }] };
      }
      return { rows: [] };
    },
  };

  const { router, cleanup } = loadAuthRouter(pool);
  try {
    const handler = getRouteHandler(router, 'PUT', '/me');
    const req = { user: { id: 'user-1' }, body: { email: 'not-an-email' } };
    const res = createMockRes();

    await handler(req, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /valid email address/);
  } finally {
    cleanup();
  }
});

test('PUT /me rejects duplicate email with HTTP 400', async () => {
  const pool = {
    async query(sql) {
      if (sql.includes('SELECT phone')) {
        return { rows: [{ id: 'user-1', email: 'old@example.com', phone: '+919876543210' }] };
      }
      if (sql.includes('SELECT id FROM users WHERE LOWER(email)')) {
        return { rows: [{ id: 'user-2' }] };
      }
      return { rows: [] };
    },
  };

  const { router, cleanup } = loadAuthRouter(pool);
  try {
    const handler = getRouteHandler(router, 'PUT', '/me');
    const req = { user: { id: 'user-1' }, body: { email: 'existing@example.com' } };
    const res = createMockRes();

    await handler(req, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /already in use/);
  } finally {
    cleanup();
  }
});

test('PUT /me updates email successfully and returns refreshed token', async () => {
  let updatedEmail = null;
  const pool = {
    async query(sql, params) {
      if (sql.includes('SELECT phone')) {
        return {
          rows: [
            {
              id: 'user-1',
              email: 'old@example.com',
              phone: '+919876543210',
              token_version: 0,
            },
          ],
        };
      }
      if (sql.includes('SELECT id FROM users WHERE LOWER(email)')) {
        return { rows: [] };
      }
      if (sql.includes('SELECT id FROM users WHERE phone_hash')) {
        return { rows: [] };
      }
      if (sql.includes('UPDATE users')) {
        updatedEmail = params[3];
        return {
          rows: [
            {
              id: 'user-1',
              email: params[3],
              name: 'Updated User',
              phone: '+919876543210',
              token_version: 0,
            },
          ],
        };
      }
      if (sql.includes('SELECT provider')) {
        return { rows: [] };
      }
      return { rows: [] };
    },
  };

  const { router, cleanup } = loadAuthRouter(pool);
  try {
    const handler = getRouteHandler(router, 'PUT', '/me');
    const req = { user: { id: 'user-1' }, body: { email: 'newemail@example.com' } };
    const res = createMockRes();

    await handler(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(updatedEmail, 'newemail@example.com');
    assert.equal(res.body.user.email, 'newemail@example.com');
    assert.ok(res.body.token, 'A refreshed auth token should be returned');
  } finally {
    cleanup();
  }
});
