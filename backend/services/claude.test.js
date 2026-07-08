const assert = require('node:assert/strict');
const test = require('node:test');

function loadClaudeWithMockedAi(mockGenerateJsonArray) {
  const aiPath = require.resolve('./ai');
  const claudePath = require.resolve('./claude');

  delete require.cache[claudePath];
  require.cache[aiPath] = {
    id: aiPath,
    filename: aiPath,
    loaded: true,
    exports: {
      generateJsonArray: mockGenerateJsonArray,
      getProviderConfig: () => ({ label: 'Mock AI' }),
      isProviderConfigured: () => true,
      normalizeProviderId: (providerId) => providerId || 'anthropic',
    },
  };

  return require('./claude');
}

test('categorizeBatch returns global transaction indexes across batches', async () => {
  const calls = [];
  const { categorizeBatch } = loadClaudeWithMockedAi(async (prompt) => {
    calls.push(prompt);

    if (calls.length === 1) {
      return Array.from({ length: 50 }, (_, index) => ({
        index: index + 1,
        category: 'Food',
        confidence: 0.8,
      }));
    }

    return [{ index: 1, category: 'Salary', confidence: 0.9 }];
  });

  const transactions = Array.from({ length: 51 }, (_, index) => ({
    date: '2026-07-01',
    description: `Transaction ${index + 1}`,
    amount: index + 1,
    type: index === 50 ? 'credit' : 'debit',
  }));

  const results = await categorizeBatch(transactions, 'anthropic');

  assert.equal(calls.length, 2);
  assert.equal(results.length, 51);
  assert.deepEqual(
    results.map((result) => result.transactionIndex),
    Array.from({ length: 51 }, (_, index) => index),
  );
  assert.equal(results[50].transactionIndex, 50);
  assert.equal(results[50].category, 'Salary');
});
