const assert = require('node:assert/strict');
const test = require('node:test');

function loadClaudeWithMockedAi(generateJsonArray) {
  const aiPath = require.resolve('./ai');
  const claudePath = require.resolve('./claude');
  const originalAi = require.cache[aiPath];

  delete require.cache[claudePath];
  require.cache[aiPath] = {
    id: aiPath,
    filename: aiPath,
    loaded: true,
    exports: {
      generateJsonArray,
      getProviderConfig: () => ({ label: 'Mock AI' }),
      isProviderConfigured: () => true,
      normalizeProviderId: () => 'mock',
    },
  };

  const claude = require('./claude');

  return {
    claude,
    restore() {
      delete require.cache[claudePath];
      if (originalAi) {
        require.cache[aiPath] = originalAi;
      } else {
        delete require.cache[aiPath];
      }
    },
  };
}

test('categorizeBatch returns global indexes for later batches', async () => {
  const calls = [];
  const { claude, restore } = loadClaudeWithMockedAi(async (prompt) => {
    calls.push(prompt);
    const indexes = [...prompt.matchAll(/^(\d+)\. Date:/gm)].map((match) => Number(match[1]));
    return indexes.map((index) => ({
      index: String(index),
      category: 'Other',
      confidence: 0.9,
    }));
  });

  try {
    const transactions = Array.from({ length: 55 }, (_, index) => ({
      date: '2026-05-18',
      description: `Transaction ${index + 1}`,
      amount: index + 1,
      type: 'debit',
    }));

    const results = await claude.categorizeBatch(transactions, 'mock');

    assert.equal(calls.length, 2);
    assert.deepEqual(
      results.map((result) => result.transactionIndex),
      Array.from({ length: 55 }, (_, index) => index),
    );
  } finally {
    restore();
  }
});
