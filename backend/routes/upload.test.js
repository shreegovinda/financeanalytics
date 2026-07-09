const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

function mockModule(modulePath, exports) {
  const original = require.cache[modulePath];

  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports,
  };

  return () => {
    if (original) {
      require.cache[modulePath] = original;
    } else {
      delete require.cache[modulePath];
    }
  };
}

function loadUploadRoute({ pool, parseStatement, categorizeBatch }) {
  const uploadPath = require.resolve('./upload');
  const restoreMocks = [
    mockModule(require.resolve('../config/db'), pool),
    mockModule(require.resolve('../services/parsers/generic'), { parseStatement }),
    mockModule(require.resolve('../services/claude'), { categorizeBatch }),
    mockModule(require.resolve('../services/ai'), { getProviderFromRequest: () => 'mock' }),
  ];
  const originalUpload = require.cache[uploadPath];

  delete require.cache[uploadPath];
  const uploadRoute = require('./upload');

  return {
    uploadRoute,
    restore() {
      delete require.cache[uploadPath];
      if (originalUpload) {
        require.cache[uploadPath] = originalUpload;
      }
      restoreMocks.reverse().forEach((restore) => restore());
    },
  };
}

function createTempFile() {
  const filePath = path.join(os.tmpdir(), `statement-${process.pid}-${Date.now()}.pdf`);
  fs.writeFileSync(filePath, 'mock statement');
  return filePath;
}

function createPoolMock({ existingTransactions = [] } = {}) {
  const poolQueries = [];
  const transactionClientQueries = [];
  const updateClientQueries = [];
  let connectCount = 0;

  const transactionClient = {
    async query(sql, params = []) {
      transactionClientQueries.push({ sql, params });

      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) {
        return { rows: [] };
      }

      if (sql.includes('SELECT id FROM statements')) {
        return { rows: [{ id: 'statement-1' }] };
      }

      if (sql.includes('FROM transactions') && sql.includes('ORDER BY created_at, id')) {
        return { rows: existingTransactions };
      }

      if (sql.includes('UPDATE statements SET bank_name')) {
        return { rows: [] };
      }

      if (sql.includes('INSERT INTO transactions')) {
        const rowCount = params.length / 6;
        return {
          rows: Array.from({ length: rowCount }, (_, index) => ({
            id: `inserted-${index + 1}`,
          })),
        };
      }

      throw new Error(`Unexpected transaction client query: ${sql}`);
    },
    release() {},
  };

  const updateClient = {
    async query(sql, params = []) {
      updateClientQueries.push({ sql, params });

      if (sql.includes('UPDATE transactions SET ai_suggested_category')) {
        return { rows: [] };
      }

      throw new Error(`Unexpected update client query: ${sql}`);
    },
    release() {},
  };

  return {
    pool: {
      async query(sql, params = []) {
        poolQueries.push({ sql, params });
        return { rows: [] };
      },
      async connect() {
        connectCount += 1;
        return connectCount === 1 ? transactionClient : updateClient;
      },
    },
    poolQueries,
    transactionClientQueries,
    updateClientQueries,
  };
}

test('resumed statement processing reuses existing transaction rows instead of inserting duplicates', async (t) => {
  const existingTransactions = [
    {
      id: 'txn-1',
      date: '2026-01-01',
      amount: '10.00',
      description: 'Existing debit',
      type: 'debit',
    },
  ];
  const poolMock = createPoolMock({ existingTransactions });
  const categorizeCalls = [];
  const filePath = createTempFile();
  const { uploadRoute, restore } = loadUploadRoute({
    pool: poolMock.pool,
    parseStatement: async () => ({
      bankName: 'Recovered Bank',
      transactions: [
        {
          date: '2026-01-01',
          amount: '10.00',
          description: 'Parsed duplicate',
          type: 'debit',
        },
      ],
    }),
    categorizeBatch: async (transactions) => {
      categorizeCalls.push(transactions);
      return [{ transactionIndex: 0, category: 'Food', confidence: 0.9 }];
    },
  });
  t.after(restore);

  await uploadRoute._test.processStatementInBackground({
    statementId: 'statement-1',
    filePath,
    originalName: 'statement.pdf',
    userId: 'user-1',
    aiProvider: 'mock',
  });

  assert.equal(
    poolMock.transactionClientQueries.some((query) => query.sql.includes('INSERT INTO transactions')),
    false,
  );
  assert.deepEqual(categorizeCalls, [
    [
      {
        date: '2026-01-01',
        amount: '10.00',
        description: 'Existing debit',
        type: 'debit',
      },
    ],
  ]);
  assert.equal(poolMock.updateClientQueries.length, 1);
});

test('categorization failure after import still completes the statement', async (t) => {
  const poolMock = createPoolMock();
  const filePath = createTempFile();
  const { uploadRoute, restore } = loadUploadRoute({
    pool: poolMock.pool,
    parseStatement: async () => ({
      bankName: 'Import Bank',
      transactions: [
        {
          date: '2026-01-02',
          amount: '25.00',
          description: 'Imported debit',
          type: 'debit',
        },
      ],
    }),
    categorizeBatch: async () => {
      throw new Error('AI provider unavailable');
    },
  });
  t.after(restore);

  await uploadRoute._test.processStatementInBackground({
    statementId: 'statement-1',
    filePath,
    originalName: 'statement.pdf',
    userId: 'user-1',
    aiProvider: 'mock',
  });

  assert.equal(
    poolMock.transactionClientQueries.some((query) => query.sql.includes('INSERT INTO transactions')),
    true,
  );

  const completionUpdate = poolMock.poolQueries.find(
    (query) => query.params[0] === 'completed' && query.params[2] === 'completed',
  );
  assert.ok(completionUpdate);
  assert.match(completionUpdate.params[3], /AI categorization failed/);
  assert.equal(
    poolMock.poolQueries.some((query) => query.params[0] === 'failed' && query.params[2] === 'failed'),
    false,
  );
});
