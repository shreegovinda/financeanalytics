const assert = require('node:assert/strict');
const test = require('node:test');

function createPoolMock(initialTransactions = []) {
  const state = {
    statements: new Map([
      [
        'statement-1',
        {
          id: 'statement-1',
          user_id: 'user-1',
          status: 'processing',
          processing_stage: 'importing_transactions',
          processing_progress: 65,
          processing_error: null,
          upload_path: null,
        },
      ],
    ]),
    transactions: initialTransactions.map((transaction) => ({ ...transaction })),
    insertCount: 0,
  };

  function selectTransactions(statementId, userId) {
    return state.transactions
      .filter(
        (transaction) => transaction.statement_id === statementId && transaction.user_id === userId,
      )
      .map((transaction) => ({
        id: transaction.id,
        date: transaction.date,
        amount: transaction.amount,
        description: transaction.description,
        type: transaction.type,
      }));
  }

  function updateStatementProgress(params) {
    const [stage, progress, status, error, processedAt, clearUploadPath, uploadPath, statementId] =
      params;
    const statement = state.statements.get(statementId);
    statement.processing_stage = stage;
    statement.processing_progress = progress;
    statement.status = status || statement.status;
    statement.processing_error = error || statement.processing_error;
    statement.processed_at = processedAt || statement.processed_at;
    if (clearUploadPath) {
      statement.upload_path = null;
    } else if (uploadPath !== null) {
      statement.upload_path = uploadPath;
    }
    return { rows: [] };
  }

  async function query(sql, params = []) {
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
      return { rows: [] };
    }

    if (sql.includes('FROM transactions')) {
      return { rows: selectTransactions(params[0], params[1]) };
    }

    if (sql.includes('SELECT id FROM statements')) {
      const statement = state.statements.get(params[0]);
      return { rows: statement && statement.user_id === params[1] ? [{ id: statement.id }] : [] };
    }

    if (sql.includes('SET processing_stage = $1') && sql.includes('status = COALESCE')) {
      return updateStatementProgress(params);
    }

    if (sql.startsWith('UPDATE statements SET processing_stage = $1')) {
      const statement = state.statements.get(params[2]);
      statement.processing_stage = params[0];
      statement.processing_progress = params[1];
      return { rows: [] };
    }

    if (sql.startsWith('UPDATE statements SET bank_name = $1')) {
      const statement = state.statements.get(params[3]);
      statement.bank_name = params[0];
      statement.processing_stage = params[1];
      statement.processing_progress = params[2];
      return { rows: [] };
    }

    if (sql.includes('INSERT INTO transactions')) {
      state.insertCount += 1;
      const rows = [];
      for (let index = 0; index < params.length; index += 6) {
        const row = {
          id: `inserted-${state.transactions.length + 1}`,
          user_id: params[index],
          statement_id: params[index + 1],
          date: params[index + 2],
          amount: params[index + 3],
          description: params[index + 4],
          type: params[index + 5],
        };
        state.transactions.push(row);
        rows.push({
          id: row.id,
          date: row.date,
          amount: row.amount,
          description: row.description,
          type: row.type,
        });
      }
      return { rows };
    }

    throw new Error(`Unexpected query in test: ${sql}`);
  }

  return {
    state,
    pool: {
      query,
      async connect() {
        return {
          query,
          release() {},
        };
      },
    },
  };
}

function loadUploadWithMocks({ pool, parseStatement, categorizeBatch }) {
  const uploadPath = require.resolve('./upload');

  delete require.cache[uploadPath];
  require.cache[require.resolve('../config/db')] = {
    loaded: true,
    exports: pool,
  };
  require.cache[require.resolve('../services/parsers/generic')] = {
    loaded: true,
    exports: { parseStatement },
  };
  require.cache[require.resolve('../services/claude')] = {
    loaded: true,
    exports: { categorizeBatch },
  };
  require.cache[require.resolve('../services/ai')] = {
    loaded: true,
    exports: { getProviderFromRequest: () => 'anthropic' },
  };

  return require('./upload')._private;
}

test('processStatementInBackground completes resumed imported rows without re-parsing or failing on categorization', async () => {
  const { pool, state } = createPoolMock([
    {
      id: 'txn-1',
      user_id: 'user-1',
      statement_id: 'statement-1',
      date: '2026-07-01',
      amount: '100.00',
      description: 'Already imported',
      type: 'debit',
    },
  ]);
  let parseCalls = 0;

  const { processStatementInBackground } = loadUploadWithMocks({
    pool,
    parseStatement: async () => {
      parseCalls += 1;
      throw new Error('parser should not run for imported statements');
    },
    categorizeBatch: async () => {
      throw new Error('provider unavailable');
    },
  });

  await processStatementInBackground({
    statementId: 'statement-1',
    filePath: null,
    originalName: 'statement.pdf',
    userId: 'user-1',
    aiProvider: 'anthropic',
  });

  const statement = state.statements.get('statement-1');
  assert.equal(parseCalls, 0);
  assert.equal(state.insertCount, 0);
  assert.equal(state.transactions.length, 1);
  assert.equal(statement.status, 'completed');
  assert.equal(statement.processing_stage, 'completed');
  assert.match(statement.processing_error, /AI categorization failed: provider unavailable/);
});

test('importTransactionsForStatement reuses existing rows instead of inserting duplicates', async () => {
  const { pool, state } = createPoolMock([
    {
      id: 'txn-1',
      user_id: 'user-1',
      statement_id: 'statement-1',
      date: '2026-07-01',
      amount: '100.00',
      description: 'Already imported',
      type: 'debit',
    },
  ]);

  const { importTransactionsForStatement } = loadUploadWithMocks({
    pool,
    parseStatement: async () => {
      throw new Error('unused');
    },
    categorizeBatch: async () => [],
  });

  const rows = await importTransactionsForStatement({
    statementId: 'statement-1',
    userId: 'user-1',
    bankName: 'TEST BANK',
    transactions: [
      {
        date: '2026-07-02',
        amount: 200,
        description: 'Would duplicate',
        type: 'debit',
      },
    ],
  });

  assert.equal(rows.length, 1);
  assert.equal(state.insertCount, 0);
  assert.equal(state.transactions.length, 1);
  assert.equal(state.statements.get('statement-1').processing_stage, 'categorizing_transactions');
});
