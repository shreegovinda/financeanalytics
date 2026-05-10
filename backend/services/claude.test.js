const assert = require('node:assert/strict');
const Module = require('node:module');
const { afterEach, test } = require('node:test');

const claudePath = require.resolve('./claude');
const aiPath = require.resolve('./ai');
const originalLoad = Module._load;

function loadClaudeWithMockedAi(generateJsonArray) {
  delete require.cache[claudePath];

  Module._load = function load(request, parent, isMain) {
    if (request === './ai' && parent?.filename === claudePath) {
      return {
        generateJsonArray,
        getProviderConfig: () => ({ label: 'Mock AI' }),
        isProviderConfigured: () => true,
        normalizeProviderId: (providerId) => providerId || 'mock',
      };
    }

    return originalLoad.apply(this, arguments);
  };

  return require('./claude');
}

afterEach(() => {
  Module._load = originalLoad;
  delete require.cache[claudePath];
  delete require.cache[aiPath];
});

test('categorizeBatch returns global indexes across multiple AI batches', async () => {
  const requestedBatchSizes = [];
  const { categorizeBatch } = loadClaudeWithMockedAi(async (prompt) => {
    const batchSize = (prompt.match(/Date:/g) || []).length;
    requestedBatchSizes.push(batchSize);

    return Array.from({ length: batchSize }, (_, index) => ({
      index: index + 1,
      category: 'Other',
      confidence: 0.9,
    }));
  });

  const transactions = Array.from({ length: 55 }, (_, index) => ({
    date: `2026-05-${String((index % 28) + 1).padStart(2, '0')}`,
    description: `Transaction ${index + 1}`,
    amount: index + 1,
    type: 'debit',
  }));

  const results = await categorizeBatch(transactions, 'mock');

  assert.deepEqual(requestedBatchSizes, [50, 5]);
  assert.equal(results.length, transactions.length);
  assert.deepEqual(
    results.map((result) => result.transactionIndex),
    transactions.map((_, index) => index),
  );
});
