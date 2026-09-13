const assert = require('node:assert/strict');
const test = require('node:test');
const requireAdmin = require('../middleware/admin');

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

test('requireAdmin middleware allows admin role and blocks user role', () => {
  let nextCalled = false;
  const adminReq = { user: { id: 'admin-1', role: 'admin' } };
  const res = createMockRes();

  requireAdmin(adminReq, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);

  // User role test
  nextCalled = false;
  const userReq = { user: { id: 'user-1', role: 'user' } };
  requireAdmin(userReq, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.ok(res.body.error.includes('Admin role required'));

  // Missing user test
  const anonReq = {};
  requireAdmin(anonReq, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test('ADMIN_EMAILS env variable promotes user to admin role in auth middleware', async () => {
  const prevAdminEmails = process.env.ADMIN_EMAILS;
  process.env.ADMIN_EMAILS = 'superadmin@finlytix.in,ops@finlytix.in';

  const authMiddlewarePath = require.resolve('../middleware/auth');
  delete require.cache[authMiddlewarePath];

  const jwt = require('jsonwebtoken');
  process.env.JWT_SECRET = 'test-secret';
  const token = jwt.sign({ id: 'user-1', tokenVersion: 0 }, process.env.JWT_SECRET);

  const mockDb = {
    query: async () => ({
      rows: [{ token_version: 0, role: 'user', email: 'superadmin@finlytix.in' }],
    }),
  };

  const restoreDb = mockModule('../config/db', mockDb);
  const authMiddleware = require('../middleware/auth');

  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = createMockRes();
  let nextCalled = false;

  await authMiddleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(req.user.role, 'admin');

  restoreDb();
  delete require.cache[authMiddlewarePath];
  process.env.ADMIN_EMAILS = prevAdminEmails;
});

test('GET /api/admin/metrics returns operational aggregates without leaking financial transactions', async () => {
  const mockQueries = [];
  const mockDb = {
    query: async (sql) => {
      mockQueries.push(sql);
      if (sql.includes('FROM users') && sql.includes('COUNT(*)')) {
        return { rows: [{ total_users: 15, verified_users: 12, admin_users: 2 }] };
      }
      if (sql.includes('FROM statements') && sql.includes('COUNT(*)')) {
        return {
          rows: [
            {
              total_statements: 50,
              completed_statements: 45,
              failed_statements: 3,
              processing_statements: 2,
            },
          ],
        };
      }
      if (sql.includes('FROM statement_files')) {
        return { rows: [{ total_files: 50, encrypted_files: 48, plaintext_files: 2 }] };
      }
      if (sql.includes('FROM statement_drafts')) {
        return { rows: [{ total_drafts: 2, pending_review_drafts: 1, failed_drafts: 1 }] };
      }
      if (sql.includes('FROM crash_reports')) {
        return {
          rows: [
            {
              total_crash_reports: 4,
              open_crash_reports: 1,
              investigating_crash_reports: 1,
              resolved_crash_reports: 2,
            },
          ],
        };
      }
      if (sql.includes('FROM user_consents')) {
        return { rows: [{ consent_version: '1.0', user_count: 15 }] };
      }
      if (sql.includes('FROM account_deletion_logs')) {
        return { rows: [{ total_deletions: 3 }] };
      }
      if (sql.includes('GROUP BY ai_key_mode')) {
        return {
          rows: [
            { ai_key_mode: 'admin', count: 10 },
            { ai_key_mode: 'personal', count: 5 },
          ],
        };
      }
      return { rows: [] };
    },
  };

  const adminRouterPath = require.resolve('../routes/admin');
  delete require.cache[adminRouterPath];
  const restoreDb = mockModule('../config/db', mockDb);
  const restoreAuth = mockModule('../middleware/auth', (req, _res, next) => next());
  const restoreAdmin = mockModule('../middleware/admin', (req, _res, next) => next());

  const router = require('../routes/admin');

  const route = router.stack.find((l) => l.route && l.route.path === '/metrics');
  assert.ok(route);

  const req = { user: { id: 'admin-1', role: 'admin' } };
  const res = createMockRes();

  const handler = route.route.stack[route.route.stack.length - 1].handle;
  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.users.total_users, 15);
  assert.equal(res.body.storage.encrypted_files, 48);
  assert.equal(res.body.privacy.total_account_deletions, 3);
  assert.equal(res.body.crash_reports.open_crash_reports, 1);

  // Privacy verification: verify that no query ever queried transactions table or ledgers
  for (const q of mockQueries) {
    assert.equal(q.includes('FROM transactions'), false);
    assert.equal(q.includes('transaction_bills'), false);
    assert.equal(q.includes('chat_messages'), false);
  }

  restoreDb();
  restoreAuth();
  restoreAdmin();
  delete require.cache[adminRouterPath];
});

test('PATCH /api/admin/crash-reports/:id updates status and rejects invalid statuses', async () => {
  let updatedStatus = null;
  const mockDb = {
    query: async (sql, params) => {
      if (sql.includes('UPDATE crash_reports')) {
        updatedStatus = params[0];
        return {
          rows: [{ id: params[1], status: params[0], created_at: new Date().toISOString() }],
        };
      }
      return { rows: [] };
    },
  };

  const adminRouterPath = require.resolve('../routes/admin');
  delete require.cache[adminRouterPath];
  const restoreDb = mockModule('../config/db', mockDb);
  const restoreAuth = mockModule('../middleware/auth', (req, _res, next) => next());
  const restoreAdmin = mockModule('../middleware/admin', (req, _res, next) => next());

  const router = require('../routes/admin');
  const route = router.stack.find(
    (l) => l.route && l.route.path === '/crash-reports/:id' && l.route.methods.patch,
  );
  assert.ok(route);

  const handler = route.route.stack[route.route.stack.length - 1].handle;

  // Test valid status update
  const validReq = {
    params: { id: 'rep-123' },
    body: { status: 'resolved' },
    user: { role: 'admin' },
  };
  const validRes = createMockRes();
  await handler(validReq, validRes);

  assert.equal(validRes.statusCode, 200);
  assert.equal(updatedStatus, 'resolved');
  assert.equal(validRes.body.report.status, 'resolved');

  // Test invalid status
  const invalidReq = {
    params: { id: 'rep-123' },
    body: { status: 'invalid_status' },
    user: { role: 'admin' },
  };
  const invalidRes = createMockRes();
  await handler(invalidReq, invalidRes);

  assert.equal(invalidRes.statusCode, 400);
  assert.ok(invalidRes.body.error.includes('Invalid status'));

  restoreDb();
  restoreAuth();
  restoreAdmin();
  delete require.cache[adminRouterPath];
});
