const assert = require('node:assert/strict');
const test = require('node:test');

function buildTransaction(index) {
  return {
    date: `2026-01-${String((index % 28) + 1).padStart(2, '0')}`,
    description: `Transaction ${index + 1}`,
    amount: index + 1,
    type: 'debit',
  };
}

test('categorizeBatch returns global transaction indexes across batches', async () => {
  const aiPath = require.resolve('./ai');
  const claudePath = require.resolve('./claude');
  const ai = require(aiPath);
  const originalGenerateJsonArray = ai.generateJsonArray;
  const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
  let callCount = 0;

  ai.generateJsonArray = async () => {
    callCount += 1;
    if (callCount === 1) {
      return [
        { index: 1, category: 'Food', confidence: 0.9 },
        { index: 50, category: 'Rent', confidence: 0.8 },
      ];
    }

    return [{ index: 1, category: 'Transport', confidence: 0.7 }];
  };
  process.env.ANTHROPIC_API_KEY = 'test-key';
  delete require.cache[claudePath];

  try {
    const { categorizeBatch } = require(claudePath);
    const transactions = Array.from({ length: 51 }, (_, index) => buildTransaction(index));

    const results = await categorizeBatch(transactions, 'anthropic');

    assert.equal(callCount, 2);
    assert.deepEqual(
      results.map((result) => result.transactionIndex),
      [0, 49, 50],
    );
  } finally {
    ai.generateJsonArray = originalGenerateJsonArray;
    if (originalAnthropicKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
    }
    delete require.cache[claudePath];
  }
});
