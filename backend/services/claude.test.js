const assert = require('node:assert/strict');
const test = require('node:test');

function loadClaudeWithMockedAi(batchResponses) {
  const aiPath = require.resolve('./ai');
  const claudePath = require.resolve('./claude');
  const originalAiModule = require.cache[aiPath];
  delete require.cache[claudePath];

  require.cache[aiPath] = {
    id: aiPath,
    filename: aiPath,
    loaded: true,
    exports: {
      generateJsonArray: async () => batchResponses.shift(),
      getProviderConfig: () => ({
        label: 'Mock AI',
        envKey: 'MOCK_API_KEY',
      }),
      isProviderConfigured: () => true,
      normalizeProviderId: () => 'mock',
    },
  };

  const claude = require('./claude');

  return {
    claude,
    cleanup() {
      delete require.cache[claudePath];
      if (originalAiModule) {
        require.cache[aiPath] = originalAiModule;
      } else {
        delete require.cache[aiPath];
      }
    },
  };
}

test('categorizeBatch returns global transaction indexes across batches', async () => {
  const batchResponses = [
    Array.from({ length: 50 }, (_, index) => ({
      index: index + 1,
      category: 'Food',
      confidence: 0.8,
    })),
    [
      {
        index: 1,
        category: 'Salary',
        confidence: 0.95,
      },
    ],
  ];
  const { claude, cleanup } = loadClaudeWithMockedAi(batchResponses);

  try {
    const transactions = Array.from({ length: 51 }, (_, index) => ({
      date: '2026-01-01',
      description: `Transaction ${index + 1}`,
      amount: index + 1,
      type: index === 50 ? 'credit' : 'debit',
    }));

    const results = await claude.categorizeBatch(transactions, 'mock');

    assert.equal(results.length, 51);
    assert.equal(results[0].transactionIndex, 0);
    assert.equal(results[49].transactionIndex, 49);
    assert.equal(results[50].transactionIndex, 50);
    assert.equal(results[50].category, 'Salary');
    assert.equal(batchResponses.length, 0);
  } finally {
    cleanup();
  }
});
