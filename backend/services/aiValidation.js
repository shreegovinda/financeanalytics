const { generateJsonObject } = require('./ai');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function executeProbe(config) {
  return generateJsonObject('Connection check. Return exactly this JSON object: {"ok":true}.', {
    ...config,
    maxTokens: 1024,
    timeoutMs: 45000,
    responseSchema: {
      type: 'OBJECT',
      properties: { ok: { type: 'BOOLEAN' } },
      required: ['ok'],
    },
  });
}

// This probe contains no user information and exercises the same JSON path as real features.
async function validateConnection(config) {
  let lastError;
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await executeProbe(config);
      if (result.ok !== true) throw new Error('Invalid JSON validation response');
      return; // Success!
    } catch (error) {
      lastError = error;
      const text = String(error.message || '');
      const status = Number(error.status) || Number(text.match(/request failed \((\d+)\)/)?.[1]);

      // If it's a client authentication/credential error, don't retry (it won't magically work)
      if (
        [401, 403, 404, 402].includes(status) ||
        /API_KEY_INVALID|API key not valid|not configured/i.test(text)
      ) {
        break;
      }

      // For transient server errors (503, high demand, timeouts), retry with backoff
      if (attempt < maxAttempts) {
        console.warn(
          `[aiValidation] Attempt ${attempt} failed for ${config.providerId}/${config.model} (${error.message}). Retrying in ${attempt * 1500}ms...`,
        );
        await sleep(attempt * 1500);
      }
    }
  }

  const text = String(lastError.message || '');
  const status = Number(lastError.status) || Number(text.match(/request failed \((\d+)\)/)?.[1]);
  console.warn('[aiValidation failed]', {
    provider: config.providerId,
    model: config.model,
    status,
    message: text.slice(0, 300),
  });

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
  } else if (status === 503 || /high demand|UNAVAILABLE|overloaded/i.test(text)) {
    code = 'AI_PROVIDER_BUSY';
    message =
      'The provider is currently experiencing temporary high demand. Please retry in a few moments or select another model.';
  } else if (status === 402) {
    code = 'AI_BILLING';
    message = 'Your provider account needs billing or credit before this model can be used.';
  } else if (
    status === 404 ||
    /model.*not found|model.*not supported|is no longer available/i.test(text)
  ) {
    code = 'AI_MODEL_UNAVAILABLE';
    message =
      'This model is unavailable for this key. Select another model (e.g. Gemini 3.8 Flash or Gemini 3.5 Flash-Lite).';
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
module.exports = { validateConnection };
