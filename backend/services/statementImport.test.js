const assert = require('node:assert/strict');
const test = require('node:test');

const { buildTransactionInsertQuery } = require('./statementImport');

test('transaction insert query is idempotent by statement row index', () => {
  const transactions = [
    {
      date: '2026-05-17',
      amount: 125.5,
      description: 'First debit',
      type: 'debit',
    },
    {
      date: '2026-05-18',
      amount: 2000,
      description: 'Salary',
      type: 'credit',
    },
  ];

  const query = buildTransactionInsertQuery(transactions, 'user-1', 'statement-1');

  assert.match(query.text, /statement_row_index/);
  assert.match(query.text, /ON CONFLICT \(statement_id, statement_row_index\)/);
  assert.match(query.text, /WHERE statement_row_index IS NOT NULL/);
  assert.match(query.text, /DO UPDATE SET/);
  assert.match(query.text, /RETURNING id, statement_row_index/);
  assert.deepEqual(query.values, [
    'user-1',
    'statement-1',
    '2026-05-17',
    125.5,
    'First debit',
    'debit',
    0,
    'user-1',
    'statement-1',
    '2026-05-18',
    2000,
    'Salary',
    'credit',
    1,
  ]);
});
