// Return only curated messages: upstream bodies can contain credentials or private data.
function chatErrorResponse(error) {
  const detail = String(error?.message || '');
  const status = Number(error?.status) || Number(detail.match(/request failed \((\d+)\)/)?.[1]);
  const result = (code, message, httpStatus = 503) => ({ code, message, status: httpStatus });
  if (error?.code === 'AI_SETUP_REQUIRED')
    return result(
      'AI_SETUP_REQUIRED',
      'Set up this AI feature in Settings → AI Models & Keys before using it.',
    );
  if (/Personal API key mode.*no personal key|Failed to decrypt personal API key/.test(detail))
    return result(
      'AI_PERSONAL_KEY',
      'Your personal AI key is missing or cannot be read. Open Settings → AI and save your key again.',
    );
  if (/not configured/.test(detail))
    return result(
      'AI_NOT_CONFIGURED',
      'Your selected AI provider is not configured. Open Settings → AI to select an available provider or add your own key.',
    );
  if (status === 429)
    return result(
      'AI_QUOTA',
      'Your AI provider quota or rate limit has been reached. Wait for it to reset, or review your plan and key in Settings → AI.',
      429,
    );
  if (status === 401 || status === 403 || /API_KEY_INVALID|API key not valid/i.test(detail))
    return result(
      'AI_AUTH',
      'The AI provider rejected the API key or its permissions. Check the key and access in Settings → AI.',
    );
  if (status === 404 || /model.*not found|model.*not supported/i.test(detail))
    return result(
      'AI_MODEL',
      'The selected AI model is unavailable for your key. Choose another model in Settings → AI.',
    );
  if (/timeout|timed out|fetch failed|ENOTFOUND|ECONNREFUSED/i.test(detail))
    return result(
      'AI_CONNECTION',
      'The assistant could not connect to its AI service. Please retry shortly.',
    );
  if ([502, 503, 504].includes(status))
    return result('AI_BUSY', 'The AI provider is temporarily busy. Please retry shortly.');
  if (/JSON|interpret question|Empty assistant response/i.test(detail))
    return result(
      'AI_RESPONSE',
      'The AI service returned an incomplete answer. Please retry your question.',
    );
  return result(
    'CHAT_FAILED',
    'The assistant could not complete the request. Please retry. If this continues, contact support.',
  );
}
module.exports = { chatErrorResponse };
