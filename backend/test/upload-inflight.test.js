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
  // Avoid pulling real AI/parser deps during route module load.
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

test('claimProcessingStatement rejects a second upload while one is processing', async () => {
  const queries = [];
  let beginCount = 0;
  const client = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql === 'BEGIN') {
        beginCount += 1;
        return { rows: [] };
      }
      if (sql.startsWith('SELECT pg_advisory_xact_lock')) {
        return { rows: [] };
      }
      if (sql.includes("status = 'processing'")) {
        // First claim sees nothing in-flight; second claim sees the inserted row.
        if (beginCount === 1) {
          return { rows: [] };
        }
        return { rows: [{ id: 'stmt-1', file_name: 'statement.pdf' }] };
      }
      if (sql.startsWith('INSERT INTO statements')) {
        return {
          rows: [
            {
              id: 'stmt-1',
              bank_name: 'DETECTING BANK',
              file_name: 'statement.pdf',
              status: 'processing',
              processing_stage: 'uploaded',
              processing_progress: 5,
            },
          ],
        };
      }
      if (sql === 'COMMIT' || sql === 'ROLLBACK') {
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release() {},
  };

  const pool = {
    async connect() {
      return client;
    },
    async query() {
      throw new Error('pool.query should not be used inside claimProcessingStatement');
    },
  };

  const { router, cleanup } = loadUploadRouter(pool);

  try {
    const first = await router.claimProcessingStatement({
      userId: 'user-1',
      fileName: 'statement.pdf',
      filePath: '/tmp/statement-1.pdf',
      aiProvider: 'anthropic',
    });
    assert.equal(first.conflict, undefined);
    assert.equal(first.statement.id, 'stmt-1');

    const second = await router.claimProcessingStatement({
      userId: 'user-1',
      fileName: 'statement.pdf',
      filePath: '/tmp/statement-2.pdf',
      aiProvider: 'anthropic',
    });
    assert.equal(second.statement, undefined);
    assert.deepEqual(second.conflict, { id: 'stmt-1', file_name: 'statement.pdf' });

    assert.ok(queries.some((q) => q.sql === 'ROLLBACK'));
    assert.ok(queries.some((q) => String(q.sql).includes('pg_advisory_xact_lock')));
  } finally {
    cleanup();
  }
});

test('getInFlightStatement returns the newest processing statement for a user', async () => {
  const pool = {
    async query(sql, params) {
      assert.match(sql, /status = 'processing'/);
      assert.deepEqual(params, ['user-1']);
      return { rows: [{ id: 'stmt-9', file_name: 'latest.pdf' }] };
    },
  };

  const { router, cleanup } = loadUploadRouter(pool);

  try {
    const inFlight = await router.getInFlightStatement('user-1');
    assert.deepEqual(inFlight, { id: 'stmt-9', file_name: 'latest.pdf' });
  } finally {
    cleanup();
  }
});
