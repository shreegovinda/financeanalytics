const assert = require('node:assert/strict');
const test = require('node:test');

const aiModulePath = require.resolve('./ai');
const claudeModulePath = require.resolve('./claude');

function loadCategorizerWithFakeAi() {
  delete require.cache[claudeModulePath];
  delete require.cache[aiModulePath];

  require.cache[aiModulePath] = {
    id: aiModulePath,
    filename: aiModulePath,
    loaded: true,
    exports: {
      generateJsonArray: async (prompt) => {
        const transactionCount = (prompt.match(/^\d+\. Date:/gm) || []).length;
        return Array.from({ length: transactionCount }, (_, index) => ({
          index: index + 1,
          category: index % 2 === 0 ? 'Food' : 'Transport',
          confidence: 0.9,
        }));
      },
      getProviderConfig: () => ({ label: 'Test AI' }),
      isProviderConfigured: () => true,
      normalizeProviderId: () => 'test',
    },
  };

  return require('./claude');
}

test('categorizeBatch preserves global indexes across batches', async () => {
  const { categorizeBatch } = loadCategorizerWithFakeAi();
  const transactions = Array.from({ length: 55 }, (_, index) => ({
    date: '2026-05-01',
    description: `Transaction ${index + 1}`,
    amount: index + 1,
    type: 'debit',
  }));

  const results = await categorizeBatch(transactions, 'test');

  assert.equal(results.length, 55);
  assert.deepEqual(
    results.map((result) => result.transactionIndex),
    Array.from({ length: 55 }, (_, index) => index),
  );
});
