const assert = require('node:assert/strict');
const test = require('node:test');

function loadClaudeWithResponder(responder) {
  const aiPath = require.resolve('./ai');
  const claudePath = require.resolve('./claude');
  const originalAiModule = require.cache[aiPath];

  delete require.cache[claudePath];
  require.cache[aiPath] = {
    id: aiPath,
    filename: aiPath,
    loaded: true,
    exports: {
      generateJsonArray: responder,
      getProviderConfig: (providerId) => ({
        envKey: `${providerId || 'anthropic'}_KEY`,
        label: providerId || 'anthropic',
      }),
      isProviderConfigured: () => true,
      normalizeProviderId: (providerId) => providerId || 'anthropic',
    },
  };

  const claude = require('./claude');

  return {
    ...claude,
    restore() {
      delete require.cache[claudePath];
      if (originalAiModule) {
        require.cache[aiPath] = originalAiModule;
      } else {
        delete require.cache[aiPath];
      }
    },
  };
}

function makeTransactions(count) {
  return Array.from({ length: count }, (_, index) => ({
    date: '2026-05-17',
    description: `Transaction ${index + 1}`,
    amount: 100 + index,
    type: 'debit',
  }));
}

test('categorizeBatch offsets AI result indexes across batches', async () => {
  const calls = [];
  const { categorizeBatch, restore } = loadClaudeWithResponder(async (prompt) => {
    calls.push(prompt);
    const batchSize = (prompt.match(/^\d+\. Date:/gm) || []).length;
    return Array.from({ length: batchSize }, (_, index) => ({
      index: index + 1,
      category: 'Food',
      confidence: 0.9,
    }));
  });

  try {
    const results = await categorizeBatch(makeTransactions(55), 'anthropic');

    assert.equal(calls.length, 2);
    assert.equal(results.length, 55);
    assert.equal(results[0].transactionIndex, 0);
    assert.equal(results[49].transactionIndex, 49);
    assert.equal(results[50].transactionIndex, 50);
    assert.equal(results[54].transactionIndex, 54);
  } finally {
    restore();
  }
});
