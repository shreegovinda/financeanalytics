'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

function loadClaudeWithAiMock(generateJsonArray) {
  const aiPath = require.resolve('../services/ai');
  const claudePath = require.resolve('../services/claude');
  const originalAiCacheEntry = require.cache[aiPath];

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

  const claude = require('../services/claude');

  return {
    claude,
    restore() {
      delete require.cache[claudePath];
      if (originalAiCacheEntry) {
        require.cache[aiPath] = originalAiCacheEntry;
      } else {
        delete require.cache[aiPath];
      }
    },
  };
}

test('categorizeBatch keeps transaction indexes global across batches', async () => {
  const batchSizes = [];
  const { claude, restore } = loadClaudeWithAiMock(async (prompt) => {
    const transactionCount = [...prompt.matchAll(/^\d+\. Date:/gm)].length;
    batchSizes.push(transactionCount);

    return Array.from({ length: transactionCount }, (_, index) => ({
      index: index + 1,
      category: 'Food',
      confidence: 0.9,
    }));
  });

  try {
    const transactions = Array.from({ length: 52 }, (_, index) => ({
      date: '2026-05-09',
      description: `Transaction ${index + 1}`,
      amount: index + 1,
      type: 'debit',
    }));

    const results = await claude.categorizeBatch(transactions, 'mock');

    assert.deepEqual(batchSizes, [50, 2]);
    assert.deepEqual(
      results.map((result) => result.transactionIndex),
      Array.from({ length: 52 }, (_, index) => index),
    );
  } finally {
    restore();
  }
});
