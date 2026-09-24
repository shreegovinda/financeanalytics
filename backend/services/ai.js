const Anthropic = require('@anthropic-ai/sdk');
const { jsonrepair } = require('jsonrepair');
const { decrypt } = require('./crypto');
const { AI_CATALOGUE } = require('../config/aiCatalogue');

let anthropicClient = null;

const PROVIDERS = {
  anthropic: {
    id: 'anthropic',
    label: 'Claude',
    envKey: 'ANTHROPIC_API_KEY',
    modelEnvKey: 'ANTHROPIC_MODEL',
    defaultModel: 'claude-opus-5',
  },
  gemini: {
    id: 'gemini',
    label: 'Gemini',
    envKey: 'GEMINI_API_KEY',
    modelEnvKey: 'GEMINI_MODEL',
    defaultModel: 'gemini-2.5-flash',
  },
  ...Object.fromEntries(
    ['openai', 'groq', 'deepseek', 'mistral'].map((id) => [
      id,
      {
        id,
        label: AI_CATALOGUE.providers[id].label,
        envKey: AI_CATALOGUE.providers[id].envKey,
        modelEnvKey: `${id.toUpperCase()}_MODEL`,
        defaultModel: AI_CATALOGUE.providers[id].models[0].id,
      },
    ]),
  ),
};

function getAnthropicClient(apiKey) {
  if (apiKey) {
    return new Anthropic.default({ apiKey });
  }
  if (!anthropicClient) {
    anthropicClient = new Anthropic.default();
  }
  return anthropicClient;
}

function getProviderConfig(providerId) {
  return PROVIDERS[providerId] || PROVIDERS[getDefaultProviderId()];
}

function getProviderModel(providerId) {
  const provider = getProviderConfig(providerId);
  return process.env[provider.modelEnvKey] || provider.defaultModel;
}

/**
 * Names the exact variable to set and where. "Claude is not configured" sends
 * people hunting; "set ANTHROPIC_API_KEY in backend/.env.local" does not.
 */
function notConfiguredMessage(providerId) {
  const provider = getProviderConfig(providerId);
  const alternatives = Object.values(PROVIDERS)
    .filter((candidate) => candidate.id !== provider.id)
    .map((candidate) => candidate.envKey);

  return (
    `${provider.label} is not configured. ` +
    `Set ${provider.envKey} in backend/.env.local and restart the server` +
    (alternatives.length
      ? `, or set ${alternatives.join(' / ')} and AI_PROVIDER to use another provider.`
      : '.')
  );
}

function isProviderConfigured(providerId) {
  const provider = getProviderConfig(providerId);
  const value = process.env[provider.envKey];
  return Boolean(value && value !== 'sk-');
}

function getDefaultProviderId() {
  const envProvider = process.env.AI_PROVIDER;
  const explicit = envProvider && PROVIDERS[envProvider] ? envProvider : null;

  if (explicit && isProviderConfigured(explicit)) {
    return explicit;
  }

  const configured = Object.keys(PROVIDERS).find(isProviderConfigured);
  if (configured) {
    return configured;
  }

  // Nothing is configured. Report the provider the user actually asked for so
  // the resulting error points at the key they need to set.
  return explicit || 'anthropic';
}

function normalizeProviderId(providerId) {
  return PROVIDERS[providerId] ? providerId : getDefaultProviderId();
}

function getProviderFromRequest(req) {
  const requestedProvider = req.get('x-ai-provider');
  if (
    requestedProvider &&
    PROVIDERS[requestedProvider] &&
    isProviderConfigured(requestedProvider)
  ) {
    return requestedProvider;
  }

  return getDefaultProviderId();
}

function getProvidersStatus() {
  const selectedProvider = getDefaultProviderId();

  return {
    selectedProvider,
    providers: Object.values(PROVIDERS).map((provider) => ({
      id: provider.id,
      label: provider.label,
      model: getProviderModel(provider.id),
      configured: isProviderConfigured(provider.id),
      envKey: provider.envKey,
    })),
  };
}

/**
 * Resolves a user's execution configuration.
 * If user selected 'personal' BYOK mode:
 *   - fetches their encrypted key
 *   - decrypts it in memory
 *   - strictly guards against falling back to admin keys
 */
async function getUserAiExecutionConfig(pool, userId, requestedProviderId = null) {
  if (!pool || !userId) {
    const fallbackProvider = requestedProviderId
      ? normalizeProviderId(requestedProviderId)
      : getDefaultProviderId();
    return {
      providerId: fallbackProvider,
      model: getProviderModel(fallbackProvider),
      apiKey: null,
      keyMode: 'admin',
    };
  }

  const userResult = await pool.query(
    'SELECT selected_ai_provider, selected_ai_model, ai_key_mode FROM users WHERE id = $1',
    [userId],
  );

  const user = userResult.rows[0];
  if (!user) {
    const fallbackProvider = requestedProviderId
      ? normalizeProviderId(requestedProviderId)
      : getDefaultProviderId();
    return {
      providerId: fallbackProvider,
      model: getProviderModel(fallbackProvider),
      apiKey: null,
      keyMode: 'admin',
    };
  }

  const providerId = requestedProviderId
    ? normalizeProviderId(requestedProviderId)
    : user.selected_ai_provider || 'gemini';
  const model =
    providerId === user.selected_ai_provider
      ? user.selected_ai_model || getProviderModel(providerId)
      : getProviderModel(providerId);
  const keyMode = user.ai_key_mode || 'admin';

  if (keyMode === 'personal') {
    const keyResult = await pool.query(
      'SELECT encrypted_key FROM user_ai_keys WHERE user_id = $1 AND provider = $2',
      [userId, providerId],
    );

    if (keyResult.rows.length === 0) {
      throw new Error(
        `Personal API key mode is enabled for ${providerId}, but no personal key has been saved. Please add your key in Settings or switch to Admin mode.`,
      );
    }

    try {
      const decryptedKey = decrypt(keyResult.rows[0].encrypted_key);
      return {
        providerId,
        model,
        apiKey: decryptedKey,
        keyMode: 'personal',
      };
    } catch {
      throw new Error(
        `Failed to decrypt personal API key for ${providerId}. Please re-enter your key in Settings.`,
      );
    }
  }

  // If keyMode is admin but provider is not configured in server env, check if user has a personal key configured
  if (!isProviderConfigured(providerId)) {
    const fallbackKeyResult = await pool.query(
      'SELECT encrypted_key FROM user_ai_keys WHERE user_id = $1 AND provider = $2',
      [userId, providerId],
    );
    if (fallbackKeyResult.rows.length > 0) {
      try {
        const decryptedKey = decrypt(fallbackKeyResult.rows[0].encrypted_key);
        return {
          providerId,
          model,
          apiKey: decryptedKey,
          keyMode: 'personal',
        };
      } catch {
        // Fall through to admin mode which will throw clear error
      }
    }
  }

  return {
    providerId,
    model,
    apiKey: null,
    keyMode: 'admin',
  };
}

async function generateWithAnthropic(prompt, maxTokens, apiKey, model, timeoutMs = 120000) {
  const effectiveModel = model || getProviderModel('anthropic');
  const client = getAnthropicClient(apiKey);
  const message = await client.messages.create(
    {
      model: effectiveModel,
      max_tokens: maxTokens,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    },
    { timeout: timeoutMs, maxRetries: 0 },
  );

  return message.content[0].type === 'text' ? message.content[0].text : '';
}

async function generateWithGemini(
  prompt,
  maxTokens,
  responseSchema,
  apiKey,
  model,
  timeout = null,
) {
  const effectiveModel = model || getProviderModel('gemini');
  const effectiveKey = apiKey || process.env.GEMINI_API_KEY;
  if (!effectiveKey) {
    throw new Error('Gemini API key is not configured');
  }

  const controller = new AbortController();
  const timeoutMs = timeout || Number(process.env.GEMINI_TIMEOUT_MS || 120000);
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const generationConfig = {
    maxOutputTokens: maxTokens,
    temperature: 0,
    responseMimeType: 'application/json',
  };

  if (responseSchema) {
    generationConfig.responseSchema = responseSchema;
  }

  let response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(effectiveModel)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': effectiveKey,
        },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }],
            },
          ],
          generationConfig,
        }),
      },
    );
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Gemini request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Gemini request failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
}

function cleanJsonText(responseText) {
  return responseText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function isExpectedJsonType(value, expectedType) {
  if (expectedType === 'array') {
    return Array.isArray(value);
  }

  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseCandidate(candidate, expectedType) {
  const value = JSON.parse(candidate);
  return isExpectedJsonType(value, expectedType) ? value : null;
}

function parseJsonResponse(responseText, expectedType, providerLabel) {
  const cleaned = cleanJsonText(responseText);
  const candidates = [cleaned];
  const match =
    expectedType === 'array' ? cleaned.match(/\[[\s\S]*\]/) : cleaned.match(/\{[\s\S]*\}/);

  if (match && match[0] !== cleaned) {
    candidates.push(match[0]);
  }

  for (const candidate of candidates) {
    try {
      const parsed = parseCandidate(candidate, expectedType);
      if (parsed) {
        return parsed;
      }
    } catch (_) {
      try {
        const parsed = parseCandidate(jsonrepair(candidate), expectedType);
        if (parsed) {
          return parsed;
        }
      } catch (_) {
        // Try the next candidate before surfacing a safe error.
      }
    }
  }

  throw new Error(`Unexpected JSON type from ${providerLabel}`);
}

const COMPATIBLE_ENDPOINTS = {
  openai: 'https://api.openai.com/v1/chat/completions',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  deepseek: 'https://api.deepseek.com/chat/completions',
  mistral: 'https://api.mistral.ai/v1/chat/completions',
};

async function generateCompatible(
  prompt,
  { providerId, model, apiKey, maxTokens, timeoutMs = 120000, responseSchema },
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(COMPATIBLE_ENDPOINTS[providerId], {
      method: 'POST',
      redirect: 'error',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey || process.env[PROVIDERS[providerId].envKey]}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: `${prompt}\nReturn a JSON object only.${responseSchema ? '\nRequired output shape: ' + JSON.stringify(responseSchema) : ''}`,
          },
        ],
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        ...(providerId === 'deepseek' ? { thinking: { type: 'disabled' } } : {}),
      }),
    });
    if (!response.ok) {
      const error = new Error(`${PROVIDERS[providerId].label} request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    const body = await response.json();
    if (body.choices?.[0]?.finish_reason === 'length')
      throw new Error('Incomplete JSON response: token limit reached');
    return body.choices?.[0]?.message?.content || '';
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('AI request timed out');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function generateJsonArray(prompt, { providerId, maxTokens, apiKey, model } = {}) {
  const provider = normalizeProviderId(providerId);

  if (!apiKey && !isProviderConfigured(provider)) {
    throw new Error(notConfiguredMessage(provider));
  }

  const effectiveModel = model || getProviderModel(provider);
  if (COMPATIBLE_ENDPOINTS[provider]) {
    const object = await generateJsonObject(
      `${prompt}\nWrap the requested array in a JSON object with exactly one property: {"items": [...]}.`,
      { providerId: provider, model: effectiveModel, apiKey, maxTokens },
    );
    if (!Array.isArray(object.items)) throw new Error('Unexpected JSON array response');
    return object.items;
  }
  const responseText =
    provider === 'gemini'
      ? await generateWithGemini(prompt, maxTokens, null, apiKey, effectiveModel)
      : await generateWithAnthropic(prompt, maxTokens, apiKey, effectiveModel);

  return parseJsonResponse(responseText, 'array', getProviderConfig(provider).label);
}

async function generateJsonObject(
  prompt,
  { providerId, maxTokens, responseSchema, apiKey, model, timeoutMs } = {},
) {
  const provider = normalizeProviderId(providerId);

  if (!apiKey && !isProviderConfigured(provider)) {
    throw new Error(notConfiguredMessage(provider));
  }

  const effectiveModel = model || getProviderModel(provider);
  const modelConfig = AI_CATALOGUE.providers[provider]?.models.find(
    (item) => item.id === effectiveModel,
  );
  maxTokens = Math.min(maxTokens || 8192, modelConfig?.maxTokens || 8192);
  const responseText = COMPATIBLE_ENDPOINTS[provider]
    ? await generateCompatible(prompt, {
        providerId: provider,
        maxTokens,
        responseSchema,
        apiKey,
        model: effectiveModel,
        timeoutMs,
      })
    : provider === 'gemini'
      ? await generateWithGemini(
          prompt,
          maxTokens,
          responseSchema,
          apiKey,
          effectiveModel,
          timeoutMs,
        )
      : await generateWithAnthropic(prompt, maxTokens, apiKey, effectiveModel, timeoutMs);

  return parseJsonResponse(responseText, 'object', getProviderConfig(provider).label);
}

module.exports = {
  getProviderConfig,
  notConfiguredMessage,
  getProviderFromRequest,
  getProvidersStatus,
  generateJsonArray,
  generateJsonObject,
  isProviderConfigured,
  normalizeProviderId,
  getUserAiExecutionConfig,
};
