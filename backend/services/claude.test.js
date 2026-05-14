const assert = require('node:assert/strict');
const test = require('node:test');

const aiPath = require.resolve('./ai');
const claudePath = require.resolve('./claude');

function loadClaudeWithAiStub(generateJsonArray) {
  const originalAiModule = require.cache[aiPath];
  delete require.cache[claudePath];

  require.cache[aiPath] = {
    id: aiPath,
    filename: aiPath,
    loaded: true,
    exports: {
      generateJsonArray,
      getProviderConfig: () => ({ label: 'Test AI' }),
      isProviderConfigured: () => true,
      normalizeProviderId: (providerId) => providerId || 'test',
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

function buildTransactions(count) {
  return Array.from({ length: count }, (_, index) => ({
    date: '2026-05-14',
    description: `Transaction ${index + 1}`,
    amount: index + 1,
    type: 'debit',
  }));
}

test('categorizeBatch returns global transaction indexes across batches', async () => {
  const calls = [];
  const { claude, restore } = loadClaudeWithAiStub(async (prompt) => {
    const transactionCount = (prompt.match(/Date:/g) || []).length;
    calls.push(transactionCount);

    return [{ index: transactionCount, category: 'Food', confidence: 0.9 }];
  });

  try {
    const results = await claude.categorizeBatch(buildTransactions(51), 'test');

    assert.deepEqual(calls, [50, 1]);
    assert.deepEqual(
      results.map((result) => result.transactionIndex),
      [49, 50],
    );
  } finally {
    restore();
  }
});
