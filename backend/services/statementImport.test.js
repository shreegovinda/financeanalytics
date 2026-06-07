const assert = require('node:assert/strict');
const test = require('node:test');

const { buildTransactionImportQuery } = require('./statementImport');

test('buildTransactionImportQuery assigns stable row indexes and upserts on replay', () => {
  const transactions = [
    {
      date: '2026-01-01',
      amount: -1200,
      description: 'Rent',
      type: 'debit',
    },
    {
      date: '2026-01-02',
      amount: 5000,
      description: 'Salary',
      type: 'credit',
    },
  ];

  const query = buildTransactionImportQuery(transactions, {
    statementId: 'statement-1',
    userId: 'user-1',
  });

  assert.match(query.text, /statement_row_index/);
  assert.match(query.text, /ON CONFLICT \(statement_id, statement_row_index\)/);
  assert.match(query.text, /DO UPDATE SET/);
  assert.equal(query.values.length, 14);
  assert.deepEqual(query.values.slice(0, 7), [
    'user-1',
    'statement-1',
    0,
    '2026-01-01',
    -1200,
    'Rent',
    'debit',
  ]);
  assert.deepEqual(query.values.slice(7, 14), [
    'user-1',
    'statement-1',
    1,
    '2026-01-02',
    5000,
    'Salary',
    'credit',
  ]);
});
