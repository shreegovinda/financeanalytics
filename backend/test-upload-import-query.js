const assert = require('node:assert/strict');
const { after, test } = require('node:test');

const pool = require('./config/db');
const uploadRouter = require('./routes/upload');

after(() => pool.end());

test('transaction import query uses per-statement row indexes for idempotent replays', () => {
  const transactions = [
    {
      date: '2026-04-01',
      amount: 100,
      description: 'ATM Withdrawal',
      type: 'debit',
    },
    {
      date: '2026-04-02',
      amount: 100,
      description: 'ATM Withdrawal',
      type: 'debit',
    },
  ];

  const query = uploadRouter.buildTransactionImportQuery('user-1', 'statement-1', transactions);

  assert.match(query.text, /statement_row_index/);
  assert.match(query.text, /ON CONFLICT \(statement_id, statement_row_index\)/);
  assert.match(query.text, /RETURNING id, statement_row_index/);
  assert.deepEqual(query.values, [
    'user-1',
    'statement-1',
    0,
    '2026-04-01',
    100,
    'ATM Withdrawal',
    'debit',
    'user-1',
    'statement-1',
    1,
    '2026-04-02',
    100,
    'ATM Withdrawal',
    'debit',
  ]);
});
