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

function loadUploadRouter(pool) {
  const uploadPath = require.resolve('../routes/upload');
  const originalUpload = require.cache[uploadPath];
  delete require.cache[uploadPath];

  const restoreDb = mockModule('../config/db', pool);
  const restoreClaude = mockModule('../services/claude', { categorizeBatch: async () => [] });
  const restoreAi = mockModule('../services/ai', {
    getProviderFromRequest: () => 'anthropic',
  });
  const restoreParser = mockModule('../services/parsers/generic', {
    parseStatement: async () => ({ bankName: 'TEST', transactions: [] }),
  });
  const restoreAuth = mockModule('../middleware/auth', (req, _res, next) => next());

  const router = require('../routes/upload');

  return {
    router,
    cleanup() {
      delete require.cache[uploadPath];
      if (originalUpload) {
        require.cache[uploadPath] = originalUpload;
      }
      restoreDb();
      restoreClaude();
      restoreAi();
      restoreParser();
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

test('GET /:statementId/draft returns 404 when no draft is pending', async () => {
  const pool = {
    async query() {
      return { rows: [] };
    },
  };

  const { router, cleanup } = loadUploadRouter(pool);
  try {
    const handler = getRouteHandler(router, 'GET', '/:statementId/draft');
    const req = { user: { id: 'user-1' }, params: { statementId: 'non-existent' } };
    const res = createMockRes();

    await handler(req, res);
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { error: 'No pending draft found for this statement.' });
  } finally {
    cleanup();
  }
});

test('GET /:statementId/draft returns draft details when pending', async () => {
  const mockDraft = {
    id: 'draft-1',
    statement_id: 'stmt-1',
    bank_name: 'ICICI',
    detected_bank_name: 'ICICI BANK',
    file_name: 'statement.pdf',
    file_format: 'PDF',
    statement_month: '2026-01',
    uploaded_at: '2026-01-15',
    transaction_count: 2,
    total_debit: '500.00',
    total_credit: '1200.00',
    status: 'pending_review',
    payload: {
      transactions: [
        { date: '2026-01-10', amount: 500, description: 'Grocery', type: 'debit' },
        { date: '2026-01-12', amount: 1200, description: 'Salary', type: 'credit' },
      ],
    },
  };

  const pool = {
    async query() {
      return { rows: [mockDraft] };
    },
  };

  const { router, cleanup } = loadUploadRouter(pool);
  try {
    const handler = getRouteHandler(router, 'GET', '/:statementId/draft');
    const req = { user: { id: 'user-1' }, params: { statementId: 'stmt-1' } };
    const res = createMockRes();

    await handler(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.statementId, 'stmt-1');
    assert.equal(res.body.bankName, 'ICICI');
    assert.equal(res.body.transactionCount, 2);
    assert.equal(res.body.transactions.length, 2);
  } finally {
    cleanup();
  }
});

test('POST /:statementId/discard removes pending draft and returns success message', async () => {
  let deletedId = null;
  const pool = {
    async query(_sql, params) {
      deletedId = params[0];
      return { rows: [{ id: params[0] }] };
    },
  };

  const { router, cleanup } = loadUploadRouter(pool);
  try {
    const handler = getRouteHandler(router, 'POST', '/:statementId/discard');
    const req = { user: { id: 'user-1' }, params: { statementId: 'stmt-to-discard' } };
    const res = createMockRes();

    await handler(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(deletedId, 'stmt-to-discard');
    assert.equal(res.body.success, true);
    assert.match(res.body.message, /Draft discarded/);
  } finally {
    cleanup();
  }
});

test('POST /:statementId/discard returns 404 when draft not found or already completed', async () => {
  const pool = {
    async query() {
      return { rows: [] };
    },
  };

  const { router, cleanup } = loadUploadRouter(pool);
  try {
    const handler = getRouteHandler(router, 'POST', '/:statementId/discard');
    const req = { user: { id: 'user-1' }, params: { statementId: 'stmt-completed' } };
    const res = createMockRes();

    await handler(req, res);
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { error: 'No pending draft found for this statement.' });
  } finally {
    cleanup();
  }
});

test('POST /:statementId/confirm imports transactions and removes draft on success', async () => {
  const queries = [];
  const client = {
    async query(sql) {
      queries.push(sql);
      if (sql.includes('FROM statement_drafts')) {
        return {
          rows: [
            {
              statement_id: 'stmt-1',
              bank_name: 'ICICI',
              file_name: 'stmt.pdf',
              statement_month: '2026-01',
              payload: {
                transactions: [
                  { date: '2026-01-10', amount: 500, description: 'Grocery', type: 'debit' },
                ],
              },
            },
          ],
        };
      }
      if (sql.includes('WITH incoming')) {
        return { rows: [] }; // No duplicate transactions
      }
      if (sql.includes('INSERT INTO transactions')) {
        return { rows: [{ id: 'txn-1' }] };
      }
      return { rows: [] };
    },
    release() {},
  };

  const pool = {
    async connect() {
      return client;
    },
    async query() {
      return { rows: [] };
    },
  };

  const origSetImmediate = global.setImmediate;
  let bgTask = null;
  global.setImmediate = (fn) => {
    bgTask = fn;
  };

  const { router, cleanup } = loadUploadRouter(pool);
  try {
    const handler = getRouteHandler(router, 'POST', '/:statementId/confirm');
    const req = { user: { id: 'user-1' }, params: { statementId: 'stmt-1' } };
    const res = createMockRes();

    await handler(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.imported, 1);
    assert.ok(queries.includes('BEGIN'));
    assert.ok(queries.includes('COMMIT'));
    assert.ok(queries.some((q) => q.includes('INSERT INTO transactions')));
    assert.ok(queries.some((q) => q.includes('DELETE FROM statement_drafts')));
    assert.ok(queries.some((q) => q.includes('UPDATE statements') && q.includes("'completed'")));
    assert.equal(typeof bgTask, 'function', 'Background categorization should be scheduled');
  } finally {
    global.setImmediate = origSetImmediate;
    cleanup();
  }
});

test('ensureMonthNotAlreadyUploaded blocks upload when pending draft exists and attaches pendingStatementId', async () => {
  const pool = {
    async query() {
      return {
        rows: [{ id: 'pending-stmt-123', status: 'pending_review', file_name: 'draft.pdf' }],
      };
    },
  };

  const { router, cleanup } = loadUploadRouter(pool);
  try {
    await assert.rejects(
      async () => {
        await router.ensureMonthNotAlreadyUploaded(pool, 'user-1', 'ICICI', '2026-01');
      },
      (err) => {
        assert.equal(err.pendingStatementId, 'pending-stmt-123');
        assert.match(err.message, /waiting for your review/);
        return true;
      },
    );
  } finally {
    cleanup();
  }
});

test('ensureMonthNotAlreadyUploaded blocks upload when completed statement exists', async () => {
  const pool = {
    async query() {
      return {
        rows: [{ id: 'completed-stmt-456', status: 'completed', file_name: 'january.pdf' }],
      };
    },
  };

  const { router, cleanup } = loadUploadRouter(pool);
  try {
    await assert.rejects(
      async () => {
        await router.ensureMonthNotAlreadyUploaded(pool, 'user-1', 'ICICI', '2026-01');
      },
      (err) => {
        assert.equal(err.pendingStatementId, undefined);
        assert.match(err.message, /transactions for 2026-01 already exist/);
        return true;
      },
    );
  } finally {
    cleanup();
  }
});

test('ensureMonthNotAlreadyUploaded permits upload when month has no statement', async () => {
  const pool = {
    async query() {
      return { rows: [] };
    },
  };

  const { router, cleanup } = loadUploadRouter(pool);
  try {
    await assert.doesNotReject(async () => {
      await router.ensureMonthNotAlreadyUploaded(pool, 'user-1', 'ICICI', '2026-02');
    });
  } finally {
    cleanup();
  }
});
