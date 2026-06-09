const assert = require('node:assert/strict');
const test = require('node:test');

function loadUploadWithMocks({ pool, parseStatement, categorizeBatch }) {
  const dbPath = require.resolve('../config/db');
  const parserPath = require.resolve('../services/parsers/generic');
  const claudePath = require.resolve('../services/claude');
  const aiPath = require.resolve('../services/ai');
  const uploadPath = require.resolve('../routes/upload');

  for (const modulePath of [uploadPath, dbPath, parserPath, claudePath, aiPath]) {
    delete require.cache[modulePath];
  }

  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: pool,
  };
  require.cache[parserPath] = {
    id: parserPath,
    filename: parserPath,
    loaded: true,
    exports: { parseStatement },
  };
  require.cache[claudePath] = {
    id: claudePath,
    filename: claudePath,
    loaded: true,
    exports: { categorizeBatch },
  };
  require.cache[aiPath] = {
    id: aiPath,
    filename: aiPath,
    loaded: true,
    exports: { getProviderFromRequest: () => 'mock' },
  };

  return require('../routes/upload');
}

test('resumed processing completes statements that already imported transactions without inserting again', async () => {
  const poolCalls = [];
  let parseCalled = false;
  const pool = {
    query: async (sql, params) => {
      poolCalls.push({ sql, params });
      if (sql.includes('COUNT(*)::int')) {
        return { rows: [{ transaction_count: 2 }] };
      }
      return { rows: [] };
    },
    connect: async () => {
      throw new Error('Import transaction should not start when rows already exist');
    },
  };
  const uploadRoutes = loadUploadWithMocks({
    pool,
    parseStatement: async () => {
      parseCalled = true;
      throw new Error('Parser should not run for already imported statements');
    },
    categorizeBatch: async () => {
      throw new Error('Categorization should not run for already imported statements');
    },
  });

  await uploadRoutes._internal.processStatementInBackground({
    statementId: 'statement-1',
    filePath: '/tmp/non-existent-statement.pdf',
    originalName: 'statement.pdf',
    userId: 'user-1',
    aiProvider: 'mock',
  });

  assert.equal(parseCalled, false);
  assert.equal(
    poolCalls.some(({ sql }) => sql.includes('INSERT INTO transactions')),
    false,
  );
  assert.ok(
    poolCalls.some(
      ({ sql, params }) =>
        sql.includes('UPDATE statements') &&
        params[0] === 'completed' &&
        params[2] === 'completed' &&
        params[5] === true,
    ),
  );
});

test('categorization failures after import do not mark committed statements failed', async () => {
  const poolCalls = [];
  const clientCalls = [];
  const client = {
    query: async (sql, params) => {
      clientCalls.push({ sql, params });
      if (sql.includes('SELECT id FROM statements')) {
        return { rows: [{ id: 'statement-1' }] };
      }
      if (sql.includes('SELECT id FROM transactions')) {
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO transactions')) {
        return { rows: [{ id: 'txn-1' }] };
      }
      return { rows: [] };
    },
    release: () => {},
  };
  const pool = {
    query: async (sql, params) => {
      poolCalls.push({ sql, params });
      if (sql.includes('COUNT(*)::int')) {
        return { rows: [{ transaction_count: 0 }] };
      }
      return { rows: [] };
    },
    connect: async () => client,
  };
  const uploadRoutes = loadUploadWithMocks({
    pool,
    parseStatement: async () => ({
      bankName: 'Test Bank',
      transactions: [
        {
          date: new Date('2026-06-01'),
          amount: 100,
          description: 'Card purchase',
          type: 'debit',
        },
      ],
    }),
    categorizeBatch: async () => {
      throw new Error('AI provider timed out');
    },
  });
  const originalConsoleError = console.error;
  console.error = () => {};

  try {
    await uploadRoutes._internal.processStatementInBackground({
      statementId: 'statement-1',
      filePath: '/tmp/non-existent-statement.pdf',
      originalName: 'statement.pdf',
      userId: 'user-1',
      aiProvider: 'mock',
    });
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(clientCalls.filter(({ sql }) => sql.includes('INSERT INTO transactions')).length, 1);
  assert.ok(
    poolCalls.some(
      ({ sql, params }) =>
        sql.includes('UPDATE statements') &&
        params[0] === 'completed' &&
        params[2] === 'completed' &&
        params[5] === true,
    ),
  );
  assert.equal(
    poolCalls.some(({ params }) => params?.[0] === 'failed'),
    false,
  );
});
