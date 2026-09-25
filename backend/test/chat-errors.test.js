const test = require('node:test');
const assert = require('node:assert/strict');
const { chatErrorResponse } = require('../services/chatErrors');
const { answerQuestion } = require('../services/chat');

test('greetings in Telugu and English need no AI key, quota or financial records', async () => {
  const pool = { query: () => assert.fail('No database retrieval for greetings') };
  for (const input of ['హలో', 'హాలో', 'హెల్లో', 'నమస్కారం!', 'Hello!', ' hi ']) {
    const result = await answerQuestion(pool, 'test-user', input, [], undefined, () =>
      assert.fail('No AI call'),
    );
    assert.ok(result.answer.length > 10);
    assert.deepEqual(result.sources, []);
    assert.deepEqual(result.evidence, []);
  }
});

test('quota, credentials, model and connectivity have safe actionable errors', () => {
  const cases = [
    ['Gemini request failed (429): sensitive upstream data', 'AI_QUOTA'],
    ['Gemini request failed (403): sensitive upstream data', 'AI_AUTH'],
    ['Gemini request failed (404): model not found', 'AI_MODEL'],
    ['Gemini API key is not configured', 'AI_NOT_CONFIGURED'],
    ['Failed to decrypt personal API key for gemini', 'AI_PERSONAL_KEY'],
    ['fetch failed', 'AI_CONNECTION'],
    ['Unexpected JSON type from Gemini', 'AI_RESPONSE'],
    ['private database error with secret', 'CHAT_FAILED'],
  ];
  for (const [message, code] of cases) {
    const response = chatErrorResponse(new Error(message));
    assert.equal(response.code, code);
    assert.doesNotMatch(response.message, /sensitive|secret|private database/);
  }
  assert.equal(chatErrorResponse({ status: 429 }).status, 429);
});
