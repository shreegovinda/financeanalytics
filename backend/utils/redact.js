const MAX_PAYLOAD_BYTES = 5 * 1024; // 5KB

// Patterns for sensitive strings
const SENSITIVE_PATTERNS = [
  // Bearer tokens and authorization headers
  { regex: /Bearer\s+[a-zA-Z0-9._~+/-]+=*/gi, replacement: 'Bearer [REDACTED_TOKEN]' },
  // JWT tokens
  {
    regex: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]*/g,
    replacement: '[REDACTED_JWT]',
  },
  // Cookie headers / values
  { regex: /(?:cookie|set-cookie)\s*:\s*[^;\r\n]+/gi, replacement: 'cookie: [REDACTED_COOKIE]' },
  // API keys (Anthropic, Google, OpenAI, etc.)
  { regex: /sk-ant-[a-zA-Z0-9_-]{10,}/g, replacement: '[REDACTED_API_KEY]' },
  { regex: /AIza[0-9A-Za-z-_]{35}/g, replacement: '[REDACTED_API_KEY]' },
  { regex: /sk-[a-zA-Z0-9_-]{20,}/g, replacement: '[REDACTED_API_KEY]' },
  // Email addresses
  { regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '[REDACTED_EMAIL]' },
  // Bank account numbers (9 to 18 consecutive digits)
  { regex: /\b\d{9,18}\b/g, replacement: '[REDACTED_ACCOUNT]' },
];

const SENSITIVE_KEY_NAMES = new Set([
  'password',
  'passwd',
  'secret',
  'token',
  'authorization',
  'auth',
  'cookie',
  'cookies',
  'apikey',
  'api_key',
  'encrypted_key',
]);

function redactString(str) {
  if (typeof str !== 'string') return str;
  let redacted = str;
  for (const { regex, replacement } of SENSITIVE_PATTERNS) {
    redacted = redacted.replace(regex, replacement);
  }
  return redacted;
}

function redactObject(val, depth = 0) {
  if (depth > 8) return '[TRUNCATED_DEPTH]';
  if (val === null || val === undefined) return val;
  if (typeof val === 'string') return redactString(val);
  if (typeof val === 'number' || typeof val === 'boolean') return val;

  if (Array.isArray(val)) {
    return val.map((item) => redactObject(item, depth + 1));
  }

  if (typeof val === 'object') {
    const result = {};
    for (const [k, v] of Object.entries(val)) {
      if (SENSITIVE_KEY_NAMES.has(k.toLowerCase())) {
        result[k] = '[REDACTED]';
      } else {
        result[k] = redactObject(v, depth + 1);
      }
    }
    return result;
  }

  return redactString(String(val));
}

function redactDiagnosticPayload(payload) {
  const redacted = redactObject(payload);
  const json = JSON.stringify(redacted);
  if (Buffer.byteLength(json, 'utf8') > MAX_PAYLOAD_BYTES) {
    return {
      truncated: true,
      error_summary:
        typeof redacted === 'object' &&
        redacted !== null &&
        typeof redacted.error_summary === 'string'
          ? redacted.error_summary.slice(0, 500)
          : 'Error details exceeded maximum size limit',
      note: 'Diagnostic details were truncated to comply with the 5KB security and storage bound.',
    };
  }
  return redacted;
}

module.exports = {
  redactString,
  redactObject,
  redactDiagnosticPayload,
  MAX_PAYLOAD_BYTES,
};
