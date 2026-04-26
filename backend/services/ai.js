const Anthropic = require('@anthropic-ai/sdk');
const { jsonrepair } = require('jsonrepair');

let anthropicClient = null;

const PROVIDERS = {
  anthropic: {
    id: 'anthropic',
    label: 'Claude 3.5 Sonnet',
    envKey: 'ANTHROPIC_API_KEY',
    modelEnvKey: 'ANTHROPIC_MODEL',
    defaultModel: 'claude-3-5-sonnet-20241022',
  },
  gemini: {
    id: 'gemini',
    label: 'Gemini 2.5 Flash',
    envKey: 'GEMINI_API_KEY',
    modelEnvKey: 'GEMINI_MODEL',
    defaultModel: 'gemini-2.5-flash',
  },
};

function getAnthropicClient() {
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

function isProviderConfigured(providerId) {
  const provider = getProviderConfig(providerId);
  const value = process.env[provider.envKey];
  return Boolean(value && value !== 'sk-');
}

function getDefaultProviderId() {
  const envProvider = process.env.AI_PROVIDER;
  if (envProvider && PROVIDERS[envProvider] && isProviderConfigured(envProvider)) {
    return envProvider;
  }

  return Object.keys(PROVIDERS).find(isProviderConfigured) || 'anthropic';
}

function normalizeProviderId(providerId) {
  return PROVIDERS[providerId] ? providerId : getDefaultProviderId();
}

function getProviderFromRequest(req) {
  const requestedProvider = req.get('x-ai-provider');
  if (requestedProvider && PROVIDERS[requestedProvider] && isProviderConfigured(requestedProvider)) {
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
    })),
  };
}

async function generateWithAnthropic(prompt, maxTokens) {
  const message = await getAnthropicClient().messages.create({
    model: getProviderModel('anthropic'),
    max_tokens: maxTokens,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  return message.content[0].type === 'text' ? message.content[0].text : '';
}

async function generateWithGemini(prompt, maxTokens, responseSchema) {
  const model = getProviderModel('gemini');
  const apiKey = process.env.GEMINI_API_KEY;
  const generationConfig = {
    maxOutputTokens: maxTokens,
    temperature: 0,
    responseMimeType: 'application/json',
  };

  if (responseSchema) {
    generationConfig.responseSchema = responseSchema;
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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

function repairCommonJsonIssues(jsonText) {
  return jsonText
    // Gemini can occasionally emit adjacent objects inside arrays without a comma.
    .replace(/}\s*{/g, '},{')
    .replace(/]\s*{/g, '],{')
    .replace(/}\s*"/g, '},"')
    .replace(/"\s*{/g, '",{');
}

function parseJsonResponse(responseText, expectedType, providerLabel) {
  const cleaned = cleanJsonText(responseText);
  const candidates = [cleaned];
  const match =
    expectedType === 'array'
      ? cleaned.match(/\[[\s\S]*\]/)
      : cleaned.match(/\{[\s\S]*\}/);

  if (match && match[0] !== cleaned) {
    candidates.push(match[0]);
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (_) {
      try {
        return JSON.parse(repairCommonJsonIssues(candidate));
      } catch (_) {
        try {
          return JSON.parse(jsonrepair(candidate));
        } catch (_) {
          try {
            return JSON.parse(jsonrepair(repairCommonJsonIssues(candidate)));
          } catch (_) {
            // Try the next candidate before surfacing a safe error.
          }
        }
      }
    }
  }

  throw new Error(`Invalid JSON response from ${providerLabel}`);
}

async function generateJsonArray(prompt, { providerId, maxTokens }) {
  const provider = normalizeProviderId(providerId);

  if (!isProviderConfigured(provider)) {
    throw new Error(`${getProviderConfig(provider).envKey} is not configured`);
  }

  const responseText =
    provider === 'gemini'
      ? await generateWithGemini(prompt, maxTokens)
      : await generateWithAnthropic(prompt, maxTokens);

  return parseJsonResponse(responseText, 'array', getProviderConfig(provider).label);
}

async function generateJsonObject(prompt, { providerId, maxTokens, responseSchema }) {
  const provider = normalizeProviderId(providerId);

  if (!isProviderConfigured(provider)) {
    throw new Error(`${getProviderConfig(provider).envKey} is not configured`);
  }

  const responseText =
    provider === 'gemini'
      ? await generateWithGemini(prompt, maxTokens, responseSchema)
      : await generateWithAnthropic(prompt, maxTokens);

  return parseJsonResponse(responseText, 'object', getProviderConfig(provider).label);
}

module.exports = {
  getProviderConfig,
  getProviderFromRequest,
  getProvidersStatus,
  generateJsonArray,
  generateJsonObject,
  isProviderConfigured,
  normalizeProviderId,
};
