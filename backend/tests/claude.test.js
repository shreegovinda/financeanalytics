const assert = require('node:assert/strict');
const test = require('node:test');

function loadClaudeWithMockAi() {
  const aiPath = require.resolve('../services/ai');
  const claudePath = require.resolve('../services/claude');
  let callCount = 0;

  delete require.cache[claudePath];
  require.cache[aiPath] = {
    id: aiPath,
    filename: aiPath,
    loaded: true,
    exports: {
      generateJsonArray: async (prompt) => {
        callCount += 1;
        const itemCount = (prompt.match(/^\d+\. Date:/gm) || []).length;
        const category = callCount === 1 ? 'Food' : 'Salary';

        return Array.from({ length: itemCount }, (_, index) => ({
          index: index + 1,
          category,
          confidence: 0.9,
        }));
      },
      getProviderConfig: () => ({ label: 'Mock AI' }),
      isProviderConfigured: () => true,
      normalizeProviderId: (providerId) => providerId || 'mock',
    },
  };

  return require('../services/claude');
}

test('categorizeBatch returns global transaction indexes across batches', async () => {
  const { categorizeBatch } = loadClaudeWithMockAi();
  const transactions = Array.from({ length: 51 }, (_, index) => ({
    date: '2026-06-01',
    description: `Transaction ${index + 1}`,
    amount: 100 + index,
    type: 'debit',
  }));

  const results = await categorizeBatch(transactions, 'mock');

  assert.equal(results.length, 51);
  assert.equal(results[0].transactionIndex, 0);
  assert.equal(results[49].transactionIndex, 49);
  assert.equal(results[50].transactionIndex, 50);
  assert.equal(results[49].category, 'Food');
  assert.equal(results[50].category, 'Salary');
});
