const assert = require('node:assert/strict');
const test = require('node:test');
const bcrypt = require('bcryptjs');

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

function loadAccountRouter(pool) {
  const accountPath = require.resolve('../routes/accountClosure');
  const originalAccount = require.cache[accountPath];
  delete require.cache[accountPath];

  const restoreDb = mockModule('../config/db', pool);
  const restoreAuth = mockModule('../middleware/auth', (req, _res, next) => next());

  const router = require('../routes/accountClosure');

  return {
    router,
    cleanup() {
      delete require.cache[accountPath];
      if (originalAccount) {
        require.cache[accountPath] = originalAccount;
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

test('POST /api/account/delete rejects request with incorrect password', async () => {
  const passwordHash = await bcrypt.hash('CorrectPassword123!', 10);
  const mockPool = {
    async query(sql) {
      if (sql.includes('SELECT id, password_hash, email FROM users')) {
        return {
          rows: [{ id: 'user-123', password_hash: passwordHash, email: 'test@example.com' }],
        };
      }
      return { rows: [] };
    },
  };

  const { router, cleanup } = loadAccountRouter(mockPool);

  try {
    const res = await invokeRoute(router, 'POST', '/delete', {
      user: { id: 'user-123' },
      body: { password: 'WrongPassword' },
    });

    assert.equal(res.statusCode, 403);
    assert.match(res.body.error, /Incorrect password/);
  } finally {
    cleanup();
  }
});

test('POST /api/account/delete successfully deletes user, increments token_version, and records audit', async () => {
  const passwordHash = await bcrypt.hash('CorrectPassword123!', 10);
  let userDeleted = false;
  let tokenVersionIncremented = false;
  let auditRecorded = false;

  const mockPool = {
    async query(sql, params) {
      if (sql.includes('SELECT id, password_hash, email FROM users')) {
        return {
          rows: [{ id: 'user-123', password_hash: passwordHash, email: 'test@example.com' }],
        };
      }
      if (sql.includes('SELECT upload_path FROM statements')) {
        return { rows: [] };
      }
      if (sql.includes('SELECT count(*) FROM statements')) {
        return { rows: [{ count: '2' }] };
      }
      if (sql.includes('SELECT count(*) FROM transactions')) {
        return { rows: [{ count: '15' }] };
      }
      if (sql.includes('INSERT INTO account_deletion_logs')) {
        auditRecorded = true;
        assert.equal(params[1], 2); // statement_count
        assert.equal(params[2], 15); // transaction_count
        return { rows: [] };
      }
      if (sql.includes('UPDATE users SET token_version = token_version + 1')) {
        tokenVersionIncremented = true;
        return { rows: [] };
      }
      if (sql.includes('DELETE FROM users WHERE id = $1')) {
        userDeleted = true;
        return { rows: [] };
      }
      return { rows: [] };
    },
  };

  const { router, cleanup } = loadAccountRouter(mockPool);

  try {
    const res = await invokeRoute(router, 'POST', '/delete', {
      user: { id: 'user-123' },
      body: { password: 'CorrectPassword123!' },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(userDeleted, true);
    assert.equal(tokenVersionIncremented, true);
    assert.equal(auditRecorded, true);
  } finally {
    cleanup();
  }
});
