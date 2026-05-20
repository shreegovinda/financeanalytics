const assert = require('node:assert/strict');
const test = require('node:test');

function loadClaudeWithAiStub(generateJsonArray) {
  const aiPath = require.resolve('./ai');
  const claudePath = require.resolve('./claude');

  delete require.cache[claudePath];
  delete require.cache[aiPath];
  require.cache[aiPath] = {
    id: aiPath,
    filename: aiPath,
    loaded: true,
    exports: {
      generateJsonArray,
      getProviderConfig: () => ({ label: 'Test AI' }),
      isProviderConfigured: () => true,
      normalizeProviderId: (providerId) => providerId || 'anthropic',
    },
  };

  return require('./claude');
}

test('categorizeBatch returns global transaction indexes across batches', async () => {
  const calls = [];
  const { categorizeBatch } = loadClaudeWithAiStub(async (prompt) => {
    calls.push(prompt);
    const batchSize = (prompt.match(/Date:/g) || []).length;

    return Array.from({ length: batchSize }, (_, index) => ({
      index: index + 1,
      category: 'Other',
      confidence: 1,
    }));
  });

  const transactions = Array.from({ length: 55 }, (_, index) => ({
    date: '2026-05-20',
    description: `Transaction ${index + 1}`,
    amount: index + 1,
    type: 'debit',
  }));

  const results = await categorizeBatch(transactions, 'anthropic');

  assert.equal(calls.length, 2);
  assert.deepEqual(
    results.map((result) => result.transactionIndex),
    Array.from({ length: 55 }, (_, index) => index),
  );
});
