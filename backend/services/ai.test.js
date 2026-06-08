const assert = require('node:assert/strict');
const test = require('node:test');

const { generateJsonObject } = require('./ai');

test('generateJsonObject rejects Gemini responses truncated by token limits', async () => {
  const originalFetch = global.fetch;
  const originalGeminiKey = process.env.GEMINI_API_KEY;

  process.env.GEMINI_API_KEY = 'test-key';
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      candidates: [
        {
          finishReason: 'MAX_TOKENS',
          content: {
            parts: [{ text: '{"bankName":"Example","transactions":[]}' }],
          },
        },
      ],
    }),
  });

  try {
    await assert.rejects(
      generateJsonObject('parse this statement', {
        providerId: 'gemini',
        maxTokens: 1,
      }),
      /max output token limit/,
    );
  } finally {
    global.fetch = originalFetch;
    if (originalGeminiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = originalGeminiKey;
    }
  }
});
