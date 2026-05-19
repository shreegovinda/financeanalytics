const assert = require('node:assert/strict');
const test = require('node:test');

function loadClaudeWithAiStub(aiStub, t) {
  const aiPath = require.resolve('./ai');
  const claudePath = require.resolve('./claude');
  const originalAi = require.cache[aiPath];
  const originalClaude = require.cache[claudePath];

  require.cache[aiPath] = {
    id: aiPath,
    filename: aiPath,
    loaded: true,
    exports: aiStub,
  };
  delete require.cache[claudePath];

  t.after(() => {
    if (originalAi) {
      require.cache[aiPath] = originalAi;
    } else {
      delete require.cache[aiPath];
    }

    if (originalClaude) {
      require.cache[claudePath] = originalClaude;
    } else {
      delete require.cache[claudePath];
    }
  });

  return require('./claude');
}

test('categorizeBatch returns global transaction indexes across batches', async (t) => {
  let callCount = 0;
  const { categorizeBatch } = loadClaudeWithAiStub(
    {
      generateJsonArray: async () => {
        callCount += 1;
        return [
          {
            index: 1,
            category: callCount === 1 ? 'Food' : 'Rent',
            confidence: 0.9,
          },
        ];
      },
      getProviderConfig: () => ({ label: 'Test AI' }),
      isProviderConfigured: () => true,
      normalizeProviderId: (providerId) => providerId,
    },
    t,
  );

  const transactions = Array.from({ length: 51 }, (_, index) => ({
    date: '2026-01-01',
    description: `Transaction ${index + 1}`,
    amount: index + 1,
    type: 'debit',
  }));

  const results = await categorizeBatch(transactions, 'test');

  assert.equal(callCount, 2);
  assert.deepEqual(
    results.map((result) => ({
      transactionIndex: result.transactionIndex,
      category: result.category,
    })),
    [
      { transactionIndex: 0, category: 'Food' },
      { transactionIndex: 50, category: 'Rent' },
    ],
  );
});
