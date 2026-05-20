const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

function installModuleStub(modulePath, exports) {
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports,
  };
}

test('background import is replay-safe and completes when categorization fails', async () => {
  const uploadPath = require.resolve('./upload');
  delete require.cache[uploadPath];

  const updates = [];
  const clientQueries = [];
  const tempFile = path.join(os.tmpdir(), `statement-${Date.now()}.pdf`);
  fs.writeFileSync(tempFile, 'statement');

  installModuleStub(require.resolve('../config/db'), {
    query: async (sql, params) => {
      updates.push({ sql, params });
      return { rows: [] };
    },
    connect: async () => ({
      query: async (sql, params) => {
        clientQueries.push({ sql, params });

        if (sql.includes('RETURNING id')) {
          return {
            rows: [
              { id: 'txn-1', statement_row_index: 0 },
              { id: 'txn-2', statement_row_index: 1 },
            ],
          };
        }

        return { rows: [] };
      },
      release: () => {},
    }),
  });
  installModuleStub(require.resolve('../middleware/auth'), (_req, _res, next) => next());
  installModuleStub(require.resolve('../services/parsers/generic'), {
    parseStatement: async () => ({
      bankName: 'Test Bank',
      transactions: [
        {
          date: '2026-05-19',
          amount: 100,
          description: 'Coffee',
          type: 'debit',
        },
        {
          date: '2026-05-20',
          amount: 200,
          description: 'Salary',
          type: 'credit',
        },
      ],
    }),
  });
  installModuleStub(require.resolve('../services/claude'), {
    categorizeBatch: async () => {
      throw new Error('provider unavailable');
    },
  });
  installModuleStub(require.resolve('../services/ai'), {
    getProviderFromRequest: () => 'anthropic',
  });

  const uploadRoutes = require('./upload');
  await uploadRoutes.processStatementInBackground({
    statementId: 'statement-1',
    filePath: tempFile,
    originalName: 'statement.pdf',
    userId: 'user-1',
    aiProvider: 'anthropic',
  });

  const insertQuery = clientQueries.find((query) => query.sql.includes('INSERT INTO transactions'));
  assert.ok(insertQuery.sql.includes('statement_row_index'));
  assert.ok(insertQuery.sql.includes('ON CONFLICT (statement_id, statement_row_index)'));
  assert.deepEqual(insertQuery.params.slice(0, 14), [
    'user-1',
    'statement-1',
    0,
    '2026-05-19',
    100,
    'Coffee',
    'debit',
    'user-1',
    'statement-1',
    1,
    '2026-05-20',
    200,
    'Salary',
    'credit',
  ]);

  const statusUpdates = updates.filter((update) => update.sql.includes('UPDATE statements'));
  assert.ok(statusUpdates.some((update) => update.params.includes('completed')));
  assert.equal(statusUpdates.some((update) => update.params.includes('failed')), false);
  assert.equal(fs.existsSync(tempFile), false);
});

test('background import maps categorization updates by statement row index', async () => {
  const uploadPath = require.resolve('./upload');
  delete require.cache[uploadPath];

  const updateParams = [];
  const tempFile = path.join(os.tmpdir(), `statement-${Date.now()}-ordered.pdf`);
  fs.writeFileSync(tempFile, 'statement');

  installModuleStub(require.resolve('../config/db'), {
    query: async () => ({ rows: [] }),
    connect: async () => ({
      query: async (sql, params) => {
        if (sql.includes('INSERT INTO transactions')) {
          return {
            rows: [
              { id: 'txn-2', statement_row_index: 1 },
              { id: 'txn-1', statement_row_index: 0 },
            ],
          };
        }

        if (sql.includes('UPDATE transactions SET ai_suggested_category')) {
          updateParams.push(params);
        }

        return { rows: [] };
      },
      release: () => {},
    }),
  });
  installModuleStub(require.resolve('../middleware/auth'), (_req, _res, next) => next());
  installModuleStub(require.resolve('../services/parsers/generic'), {
    parseStatement: async () => ({
      bankName: 'Test Bank',
      transactions: [
        {
          date: '2026-05-19',
          amount: 100,
          description: 'Coffee',
          type: 'debit',
        },
        {
          date: '2026-05-20',
          amount: 200,
          description: 'Salary',
          type: 'credit',
        },
      ],
    }),
  });
  installModuleStub(require.resolve('../services/claude'), {
    categorizeBatch: async () => [
      { transactionIndex: 0, category: 'Food' },
      { transactionIndex: 1, category: 'Income' },
    ],
  });
  installModuleStub(require.resolve('../services/ai'), {
    getProviderFromRequest: () => 'anthropic',
  });

  const uploadRoutes = require('./upload');
  await uploadRoutes.processStatementInBackground({
    statementId: 'statement-1',
    filePath: tempFile,
    originalName: 'statement.pdf',
    userId: 'user-1',
    aiProvider: 'anthropic',
  });

  assert.deepEqual(updateParams, [
    ['Food', 'txn-1'],
    ['Income', 'txn-2'],
  ]);
  assert.equal(fs.existsSync(tempFile), false);
});
