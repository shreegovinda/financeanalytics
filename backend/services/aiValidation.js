const { generateJsonObject } = require('./ai');

// This probe contains no user information and exercises the same JSON path as real features.
async function validateConnection(config) {
  try {
    const result = await generateJsonObject(
      'Connection check. Return exactly this JSON object: {"ok":true}.',
      {
        ...config,
        maxTokens: 1024,
        timeoutMs: 20000,
        responseSchema: {
          type: 'OBJECT',
          properties: { ok: { type: 'BOOLEAN' } },
          required: ['ok'],
        },
      },
    );
    if (result.ok !== true) throw new Error('Invalid JSON validation response');
  } catch (error) {
    const text = String(error.message || '');
    const status = Number(error.status) || Number(text.match(/request failed \((\d+)\)/)?.[1]);
    let message =
      'The provider could not complete the model check. Check the model and key, then try again.';
    let code = 'AI_VALIDATION_FAILED';
    if ([401, 403].includes(status) || /API_KEY_INVALID|API key not valid/i.test(text)) {
      code = 'AI_KEY_REJECTED';
      message =
        'This provider rejected the key or its permissions. Check that the key belongs to the selected provider and has access to this model.';
    } else if (status === 429) {
      code = 'AI_QUOTA';
      message =
        'The provider reported a quota or rate limit. We could not validate this selection. Check your provider limits and retry.';
    } else if (status === 402) {
      code = 'AI_BILLING';
      message = 'Your provider account needs billing or credit before this model can be used.';
    } else if (status === 404 || /model.*not found|model.*not supported/i.test(text)) {
      code = 'AI_MODEL_UNAVAILABLE';
      message =
        'This model is unavailable for this key. Select another model or enable access in your provider account.';
    } else if (/not configured/i.test(text)) {
      code = 'AI_NOT_CONFIGURED';
      message = 'There is no platform key for this provider. Choose your own API key.';
    } else if (/timeout|timed out|fetch failed|ENOTFOUND|ECONNREFUSED/i.test(text)) {
      code = 'AI_CONNECTION';
      message = 'The provider did not respond in time. Check connectivity and retry.';
    } else if (/JSON/i.test(text)) {
      code = 'AI_FORMAT';
      message =
        'This model did not return the structured response Finlytix needs. Try again or choose another model.';
    }
    throw Object.assign(new Error(message + ' Your previous settings were not changed.'), {
      status: 422,
      code,
    });
  }
}
module.exports = { validateConnection };
