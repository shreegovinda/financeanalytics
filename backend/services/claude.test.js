const assert = require('node:assert/strict');
const test = require('node:test');

const aiPath = require.resolve('./ai');
const claudePath = require.resolve('./claude');

function loadClaudeWithAiMock(generateJsonArray) {
  const originalAiModule = require.cache[aiPath];

  delete require.cache[claudePath];
  require.cache[aiPath] = {
    id: aiPath,
    filename: aiPath,
    loaded: true,
    exports: {
      generateJsonArray,
      getProviderConfig: () => ({ label: 'Mock AI' }),
      isProviderConfigured: () => true,
      normalizeProviderId: (providerId) => providerId || 'anthropic',
    },
  };

  const claude = require('./claude');

  return {
    claude,
    restore() {
      delete require.cache[claudePath];
      if (originalAiModule) {
        require.cache[aiPath] = originalAiModule;
      } else {
        delete require.cache[aiPath];
      }
    },
  };
}

test('categorizeBatch returns global transaction indexes across AI batches', async (t) => {
  const { claude, restore } = loadClaudeWithAiMock(async (prompt) => {
    const transactionCount = (prompt.match(/^\d+\. Date:/gm) || []).length;

    return Array.from({ length: transactionCount }, (_, index) => ({
      index: index + 1,
      category: 'Food',
      confidence: 0.95,
    }));
  });
  t.after(restore);

  const transactions = Array.from({ length: 60 }, (_, index) => ({
    date: '2026-05-12',
    description: `Transaction ${index + 1}`,
    amount: index + 1,
    type: 'debit',
  }));

  const results = await claude.categorizeBatch(transactions, 'anthropic');

  assert.deepEqual(
    results.map((result) => result.transactionIndex),
    Array.from({ length: 60 }, (_, index) => index),
  );
});
