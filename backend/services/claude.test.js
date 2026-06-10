const assert = require('node:assert/strict');
const test = require('node:test');

function loadCategorizerWithMockedAi(generateJsonArray) {
  const aiPath = require.resolve('./ai');
  const claudePath = require.resolve('./claude');

  delete require.cache[claudePath];
  require.cache[aiPath] = {
    id: aiPath,
    filename: aiPath,
    loaded: true,
    exports: {
      generateJsonArray,
      getProviderConfig: () => ({ label: 'Test Provider' }),
      isProviderConfigured: () => true,
      normalizeProviderId: (providerId) => providerId || 'anthropic',
    },
  };

  return require('./claude');
}

test('categorizeBatch keeps transaction indexes global across batches', async () => {
  const { categorizeBatch } = loadCategorizerWithMockedAi(async (prompt) => {
    const transactionCount = [...prompt.matchAll(/^\d+\. Date:/gm)].length;
    return Array.from({ length: transactionCount }, (_, index) => ({
      index: index + 1,
      category: 'Food',
      confidence: 0.9,
    }));
  });

  const transactions = Array.from({ length: 55 }, (_, index) => ({
    date: '2026-01-01',
    description: `Transaction ${index + 1}`,
    amount: 100 + index,
    type: 'debit',
  }));

  const results = await categorizeBatch(transactions, 'anthropic');

  assert.equal(results.length, 55);
  assert.deepEqual(
    results.map((result) => result.transactionIndex),
    Array.from({ length: 55 }, (_, index) => index),
  );
});
