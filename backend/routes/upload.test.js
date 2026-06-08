const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const pool = require('../config/db');
const uploadRoutes = require('./upload');

test('importTransactionsForStatement upserts by stable statement row index', async () => {
  const queries = [];
  const transactions = [
    {
      date: new Date('2026-06-01'),
      amount: 100,
      description: 'First transaction',
      type: 'debit',
    },
    {
      date: new Date('2026-06-02'),
      amount: 200,
      description: 'Second transaction',
      type: 'credit',
    },
  ];

  const client = {
    query: async (sql, params) => {
      queries.push({ sql, params });

      if (sql.includes('SELECT id, statement_row_index')) {
        return { rows: [] };
      }

      if (sql.includes('INSERT INTO transactions')) {
        return {
          rows: [
            { id: 'txn-second', statement_row_index: 1 },
            { id: 'txn-first', statement_row_index: 0 },
          ],
        };
      }

      throw new Error(`Unexpected query: ${sql}`);
    },
  };

  const txnIds = await uploadRoutes.importTransactionsForStatement(client, {
    statementId: 'statement-id',
    userId: 'user-id',
    transactions,
  });

  const insertQuery = queries.find((query) => query.sql.includes('INSERT INTO transactions'));

  assert.deepEqual(txnIds, ['txn-first', 'txn-second']);
  assert.match(insertQuery.sql, /statement_row_index/);
  assert.match(insertQuery.sql, /ON CONFLICT \(statement_id, statement_row_index\)/);
  assert.deepEqual(insertQuery.params.slice(0, 7), [
    'user-id',
    'statement-id',
    0,
    transactions[0].date,
    100,
    'First transaction',
    'debit',
  ]);
  assert.deepEqual(insertQuery.params.slice(7, 14), [
    'user-id',
    'statement-id',
    1,
    transactions[1].date,
    200,
    'Second transaction',
    'credit',
  ]);
});

test('processStatementInBackground does not delete file when another worker owns the lock', async () => {
  const originalConnect = pool.connect;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-lock-'));
  const filePath = path.join(tempDir, 'statement.pdf');
  fs.writeFileSync(filePath, 'placeholder');

  pool.connect = async () => ({
    query: async () => ({ rows: [{ acquired: false }] }),
    release: () => {},
  });

  try {
    await uploadRoutes.processStatementInBackground({
      statementId: 'statement-id',
      filePath,
      originalName: 'statement.pdf',
      userId: 'user-id',
      aiProvider: 'gemini',
    });

    assert.equal(fs.existsSync(filePath), true);
  } finally {
    pool.connect = originalConnect;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
