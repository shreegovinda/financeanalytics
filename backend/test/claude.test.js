const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

function loadClaudeWithAiMock(generateJsonArray) {
  const aiPath = path.resolve(__dirname, '../services/ai.js');
  const claudePath = path.resolve(__dirname, '../services/claude.js');

  delete require.cache[claudePath];
  require.cache[aiPath] = {
    id: aiPath,
    filename: aiPath,
    loaded: true,
    exports: {
      generateJsonArray,
      getProviderConfig: () => ({ label: 'Mock AI' }),
      isProviderConfigured: () => true,
      normalizeProviderId: (providerId) => providerId || 'mock',
    },
  };

  return require(claudePath);
}

test('categorizeBatch offsets batch-local AI indexes to global transaction indexes', async () => {
  let callCount = 0;
  const { categorizeBatch } = loadClaudeWithAiMock(async () => {
    callCount += 1;
    const batchLength = callCount === 1 ? 50 : 1;
    return Array.from({ length: batchLength }, (_, index) => ({
      index: index + 1,
      category: callCount === 1 ? 'Food' : 'Transport',
      confidence: 0.9,
    }));
  });

  const transactions = Array.from({ length: 51 }, (_, index) => ({
    date: '2026-07-01',
    description: `Transaction ${index + 1}`,
    amount: 100 + index,
    type: 'debit',
  }));

  const results = await categorizeBatch(transactions, 'mock');

  assert.equal(results.length, 51);
  assert.equal(results[0].transactionIndex, 0);
  assert.equal(results[49].transactionIndex, 49);
  assert.equal(results[50].transactionIndex, 50);
  assert.equal(results[50].category, 'Transport');
});
