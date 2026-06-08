const assert = require('node:assert/strict');
const test = require('node:test');

const { categorizeBatch } = require('./claude');

function buildTransactions(count) {
  return Array.from({ length: count }, (_, index) => ({
    date: '2026-06-01',
    description: `Transaction ${index + 1}`,
    amount: 100 + index,
    type: 'debit',
  }));
}

test('categorizeBatch returns global indexes across provider batches', async () => {
  const originalFetch = global.fetch;
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  let callCount = 0;

  process.env.GEMINI_API_KEY = 'test-key';
  global.fetch = async () => {
    callCount++;
    const batchSize = callCount === 1 ? 50 : 5;
    const categorizations = Array.from({ length: batchSize }, (_, index) => ({
      index: index + 1,
      category: callCount === 1 ? 'Food' : 'Salary',
      confidence: 0.9,
    }));

    return {
      ok: true,
      json: async () => ({
        candidates: [
          {
            finishReason: 'STOP',
            content: {
              parts: [{ text: JSON.stringify(categorizations) }],
            },
          },
        ],
      }),
    };
  };

  try {
    const results = await categorizeBatch(buildTransactions(55), 'gemini');

    assert.equal(callCount, 2);
    assert.equal(results.length, 55);
    assert.deepEqual(
      results.map((result) => result.transactionIndex),
      Array.from({ length: 55 }, (_, index) => index),
    );
    assert.equal(results[49].category, 'Food');
    assert.equal(results[50].category, 'Salary');
  } finally {
    global.fetch = originalFetch;
    if (originalGeminiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = originalGeminiKey;
    }
  }
});
