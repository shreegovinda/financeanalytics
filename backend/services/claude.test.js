const assert = require('node:assert/strict');
const test = require('node:test');

function loadClaudeWithAiMock(generateJsonArray) {
  const aiPath = require.resolve('./ai');
  const claudePath = require.resolve('./claude');
  const originalAi = require.cache[aiPath];
  const originalClaude = require.cache[claudePath];

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

  return {
    claude: require('./claude'),
    restore() {
      delete require.cache[claudePath];
      if (originalClaude) {
        require.cache[claudePath] = originalClaude;
      }
      if (originalAi) {
        require.cache[aiPath] = originalAi;
      } else {
        delete require.cache[aiPath];
      }
    },
  };
}

test('categorizeBatch preserves global indexes across AI batches', async (t) => {
  const { claude, restore } = loadClaudeWithAiMock(async (prompt) => {
    const transactionCount = (prompt.match(/^\d+\. Date:/gm) || []).length;

    return Array.from({ length: transactionCount }, (_, index) => ({
      index: index + 1,
      category: 'Food',
      confidence: 0.9,
    }));
  });
  t.after(restore);

  const transactions = Array.from({ length: 55 }, (_, index) => ({
    date: '2026-01-01',
    description: `Transaction ${index + 1}`,
    amount: index + 1,
    type: 'debit',
  }));

  const results = await claude.categorizeBatch(transactions, 'mock');

  assert.equal(results.length, 55);
  assert.equal(results[0].transactionIndex, 0);
  assert.equal(results[49].transactionIndex, 49);
  assert.equal(results[50].transactionIndex, 50);
  assert.equal(results[54].transactionIndex, 54);
});
