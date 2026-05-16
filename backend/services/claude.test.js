const assert = require('node:assert/strict');
const test = require('node:test');

const aiPath = require.resolve('./ai');
const claudePath = require.resolve('./claude');

function loadClaudeWithResponses(responses) {
  delete require.cache[claudePath];

  require.cache[aiPath] = {
    id: aiPath,
    filename: aiPath,
    loaded: true,
    exports: {
      generateJsonArray: async () => responses.shift() || [],
      getProviderConfig: () => ({ label: 'Test AI' }),
      isProviderConfigured: () => true,
      normalizeProviderId: (providerId) => providerId || 'anthropic',
    },
  };

  return require('./claude');
}

test('categorizeBatch returns global transaction indexes across batches', async () => {
  const firstBatch = Array.from({ length: 50 }, (_, index) => ({
    index: index + 1,
    category: 'Food',
    confidence: 0.9,
  }));
  const secondBatch = [
    { index: 1, category: 'Transport', confidence: 0.8 },
    { index: 2, category: 'Shopping', confidence: 0.7 },
    { index: 3, category: 'Utilities', confidence: 0.6 },
  ];
  const { categorizeBatch } = loadClaudeWithResponses([firstBatch, secondBatch]);
  const transactions = Array.from({ length: 53 }, (_, index) => ({
    date: '2026-05-16',
    description: `Transaction ${index + 1}`,
    amount: 100 + index,
    type: 'debit',
  }));

  const results = await categorizeBatch(transactions, 'anthropic');

  assert.equal(results.length, 53);
  assert.equal(results[0].transactionIndex, 0);
  assert.equal(results[49].transactionIndex, 49);
  assert.equal(results[50].transactionIndex, 50);
  assert.equal(results[50].category, 'Transport');
  assert.equal(results[52].transactionIndex, 52);
  assert.equal(results[52].category, 'Utilities');
});

test('categorizeBatch drops invalid AI indexes instead of returning unsafe indexes', async () => {
  const { categorizeBatch } = loadClaudeWithResponses([
    [
      { index: 0, category: 'Food', confidence: 0.9 },
      { index: 1, category: 'Not A Category', confidence: 2 },
      { index: 99, category: 'Transport', confidence: 0.8 },
    ],
  ]);
  const transactions = [
    {
      date: '2026-05-16',
      description: 'Coffee',
      amount: 100,
      type: 'debit',
    },
  ];

  const results = await categorizeBatch(transactions, 'anthropic');

  assert.deepEqual(results, [
    {
      transactionIndex: 0,
      category: 'Other',
      confidence: 1,
    },
  ]);
});
