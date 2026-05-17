const assert = require('node:assert/strict');
const test = require('node:test');

const { upsertStatementTransactions } = require('./statementImport');

function createRecordingClient() {
  const queries = [];

  return {
    queries,
    async query(sql, params) {
      queries.push({ sql, params });

      if (!sql.includes('RETURNING id')) {
        return { rows: [] };
      }

      const rows = [];
      for (let offset = 0; offset < params.length; offset += 7) {
        const rowIndex = params[offset + 2];
        rows.push({
          id: `txn-${rowIndex}`,
          statement_row_index: rowIndex,
        });
      }

      return { rows };
    },
  };
}

test('upsertStatementTransactions records row indexes and returns ids in statement order', async () => {
  const client = createRecordingClient();

  const ids = await upsertStatementTransactions(client, {
    userId: 'user-1',
    statementId: 'statement-1',
    transactions: [
      {
        date: '2026-05-16',
        amount: 12.34,
        description: 'First',
        type: 'debit',
      },
      {
        date: '2026-05-17',
        amount: 56.78,
        description: 'Second',
        type: 'credit',
      },
    ],
  });

  assert.deepEqual(ids, ['txn-0', 'txn-1']);
  assert.equal(client.queries.length, 2);
  assert.match(
    client.queries[0].sql,
    /DELETE FROM transactions WHERE statement_id = \$1 AND statement_row_index IS NULL/,
  );
  assert.deepEqual(client.queries[0].params, ['statement-1']);
  assert.match(client.queries[1].sql, /ON CONFLICT \(statement_id, statement_row_index\)/);
  assert.match(client.queries[1].sql, /WHERE statement_row_index IS NOT NULL/);
  assert.deepEqual(client.queries[1].params, [
    'user-1',
    'statement-1',
    0,
    '2026-05-16',
    12.34,
    'First',
    'debit',
    'user-1',
    'statement-1',
    1,
    '2026-05-17',
    56.78,
    'Second',
    'credit',
  ]);
});

test('upsertStatementTransactions still cleans legacy rows when statement has no transactions', async () => {
  const client = createRecordingClient();

  const ids = await upsertStatementTransactions(client, {
    userId: 'user-1',
    statementId: 'statement-1',
    transactions: [],
  });

  assert.deepEqual(ids, []);
  assert.equal(client.queries.length, 1);
  assert.deepEqual(client.queries[0].params, ['statement-1']);
});
