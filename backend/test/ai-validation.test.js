const test = require('node:test');
const { URL } = require('node:url');
const assert = require('node:assert/strict');
const { validateConnection } = require('../services/aiValidation');
const { generateJsonArray } = require('../services/ai');

for (const [providerId, model, host] of [
  ['openai', 'gpt-4.1-mini', 'api.openai.com'],
  ['groq', 'llama-3.3-70b-versatile', 'api.groq.com'],
  ['deepseek', 'deepseek-flash', 'api.deepseek.com'],
  ['mistral', 'mistral-small-latest', 'api.mistral.ai'],
]) {
  test(`${providerId} validates exact credentials with a synthetic JSON probe`, async (t) => {
    t.mock.method(global, 'fetch', async (url, options) => {
      assert.equal(new URL(url).hostname, host);
      assert.equal(options.headers.Authorization, 'Bearer synthetic-key');
      const body = JSON.parse(options.body);
      assert.equal(body.model, model);
      assert.match(body.messages[0].content, /Connection check/);
      assert.equal(body.response_format.type, 'json_object');
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] }),
      };
    });
    await validateConnection({ providerId, model, apiKey: 'synthetic-key' });
  });
}
for (const [status, code] of [
  [401, 'AI_KEY_REJECTED'],
  [403, 'AI_KEY_REJECTED'],
  [404, 'AI_MODEL_UNAVAILABLE'],
  [429, 'AI_QUOTA'],
  [402, 'AI_BILLING'],
]) {
  test(`validation sanitizes provider error ${status}`, async (t) => {
    t.mock.method(global, 'fetch', async () => ({ ok: false, status }));
    await assert.rejects(
      () =>
        validateConnection({
          providerId: 'openai',
          model: 'gpt-4.1-mini',
          apiKey: 'synthetic-key',
        }),
      (error) => {
        assert.equal(error.status, 422);
        assert.equal(error.code, code);
        assert.ok(!error.message.includes('synthetic-key'));
        return true;
      },
    );
  });
}
test('invalid probe response cannot validate and arrays are unwrapped for extraction', async (t) => {
  t.mock.method(global, 'fetch', async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: '{"items":[{"amount":42}]}' } }] }),
  }));
  const config = { providerId: 'openai', model: 'gpt-4.1-mini', apiKey: 'synthetic-key' };
  await assert.rejects(() => validateConnection(config), { code: 'AI_FORMAT' });
  assert.deepEqual(await generateJsonArray('Synthetic transaction', config), [{ amount: 42 }]);
});
