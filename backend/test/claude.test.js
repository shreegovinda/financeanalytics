const assert = require('node:assert/strict');
const test = require('node:test');

function mockModule(modulePath, exports) {
  const resolvedPath = require.resolve(modulePath);
  const originalModule = require.cache[resolvedPath];

  require.cache[resolvedPath] = {
    id: resolvedPath,
    filename: resolvedPath,
    loaded: true,
    exports,
  };

  return () => {
    if (originalModule) {
      require.cache[resolvedPath] = originalModule;
    } else {
      delete require.cache[resolvedPath];
    }
  };
}

function loadClaudeService(generateJsonArray) {
  const claudePath = require.resolve('../services/claude');
  const originalClaude = require.cache[claudePath];
  delete require.cache[claudePath];

  const restoreAi = mockModule('../services/ai', {
    generateJsonArray,
    getProviderConfig: () => ({ label: 'Test AI' }),
    isProviderConfigured: () => true,
    normalizeProviderId: (providerId) => providerId || 'test',
  });

  const service = require('../services/claude');

  return {
    service,
    cleanup() {
      delete require.cache[claudePath];
      if (originalClaude) {
        require.cache[claudePath] = originalClaude;
      }
      restoreAi();
    },
  };
}

test('categorizeBatch preserves global transaction indexes across batches', async () => {
  const batches = [
    [
      { index: 1, category: 'Food', confidence: 0.9 },
      { index: 50, category: 'Transport', confidence: 0.8 },
    ],
    [
      { index: 1, category: 'Shopping', confidence: 0.7 },
      { index: 50, category: 'Utilities', confidence: 0.6 },
    ],
    [
      { index: 1, category: 'Investment', confidence: 0.5 },
      { index: 20, category: 'Other', confidence: 0.4 },
    ],
  ];
  let callIndex = 0;
  const { service, cleanup } = loadClaudeService(async () => batches[callIndex++]);

  try {
    const transactions = Array.from({ length: 120 }, (_, index) => ({
      date: '2026-07-13',
      description: `Transaction ${index + 1}`,
      amount: index + 1,
      type: 'debit',
    }));

    const results = await service.categorizeBatch(transactions, 'test');

    assert.equal(callIndex, 3);
    assert.deepEqual(
      results.map((result) => result.transactionIndex),
      [0, 49, 50, 99, 100, 119],
    );
    assert.deepEqual(
      results.map((result) => result.category),
      ['Food', 'Transport', 'Shopping', 'Utilities', 'Investment', 'Other'],
    );
  } finally {
    cleanup();
  }
});

test('categorizeBatch ignores invalid model indexes', async () => {
  const { service, cleanup } = loadClaudeService(async () => [
    { index: 0, category: 'Food', confidence: 0.9 },
    { index: 3, category: 'Shopping', confidence: 0.8 },
    { index: 1, category: 'Food', confidence: 0.7 },
    { index: 2, category: 'Transport', confidence: 0.6 },
  ]);

  try {
    const transactions = [
      { date: '2026-07-13', description: 'A', amount: 1, type: 'debit' },
      { date: '2026-07-13', description: 'B', amount: 2, type: 'debit' },
    ];

    const results = await service.categorizeBatch(transactions, 'test');

    assert.deepEqual(
      results.map((result) => result.transactionIndex),
      [0, 1],
    );
  } finally {
    cleanup();
  }
});
