// Curated text/JSON models. Live validation checks access before a feature is saved.
const model = (id, label, description, maxTokens = 8192) => ({
  id,
  label,
  description,
  maxTokens,
  isDefault: false,
});
const AI_CATALOGUE = {
  providers: {
    gemini: {
      id: 'gemini',
      label: 'Google Gemini',
      description: 'Google models for extraction and conversational analysis.',
      envKey: 'GEMINI_API_KEY',
      docsUrl: 'https://aistudio.google.com/api-keys',
      models: [
        model(
          'gemini-3.8-flash',
          'Gemini 3.8 Flash',
          'General-purpose text and structured responses.',
          32768,
        ),
        model(
          'gemini-3.5-flash-lite',
          'Gemini 3.5 Flash-Lite',
          'Lightweight extraction and everyday questions.',
          32768,
        ),
        model(
          'gemini-3.1-pro-preview',
          'Gemini 3.1 Pro Preview',
          'Preview model; availability can change.',
          32768,
        ),
        model(
          'gemini-2.5-flash',
          'Gemini 2.5 Flash',
          'Legacy model; access may be limited to existing projects.',
          32768,
        ),
        model(
          'gemini-2.5-flash-lite',
          'Gemini 2.5 Flash-Lite',
          'Legacy lightweight model; validate project access.',
          32768,
        ),
        model(
          'gemini-2.5-pro',
          'Gemini 2.5 Pro',
          'Legacy reasoning model; validate project access.',
          32768,
        ),
      ],
    },
    anthropic: {
      id: 'anthropic',
      label: 'Anthropic Claude',
      description: 'Claude models for reasoning and document analysis.',
      envKey: 'ANTHROPIC_API_KEY',
      docsUrl: 'https://platform.claude.com/settings/keys',
      models: [
        model('claude-sonnet-4-6', 'Claude Sonnet 4.6', 'Reasoning and detailed analysis.', 16384),
        model(
          'claude-haiku-4-5',
          'Claude Haiku 4.5',
          'Compact conversational and extraction model.',
        ),
        model(
          'claude-3-5-sonnet-20241022',
          'Claude 3.5 Sonnet (legacy)',
          'Existing configurations only; provider may reject retired models.',
        ),
        model(
          'claude-3-7-sonnet-20250219',
          'Claude 3.7 Sonnet (legacy)',
          'Existing configurations only; provider may reject retired models.',
        ),
      ],
    },
    openai: {
      id: 'openai',
      label: 'OpenAI',
      description: 'GPT models for structured data and financial conversations.',
      envKey: 'OPENAI_API_KEY',
      docsUrl: 'https://platform.openai.com/api-keys',
      models: [
        model('gpt-4.1', 'GPT-4.1', 'Detailed instruction following and extraction.', 32768),
        model('gpt-4.1-mini', 'GPT-4.1 mini', 'Compact model for everyday analysis.', 32768),
        model(
          'gpt-4.1-nano',
          'GPT-4.1 nano',
          'Lightweight classification and simple queries.',
          32768,
        ),
      ],
    },
    groq: {
      id: 'groq',
      label: 'Groq',
      description: 'Hosted open models for fast text responses.',
      envKey: 'GROQ_API_KEY',
      docsUrl: 'https://console.groq.com/keys',
      models: [
        model(
          'llama-3.3-70b-versatile',
          'Llama 3.3 70B',
          'General-purpose reasoning and structured text.',
          32768,
        ),
        model(
          'llama-3.1-8b-instant',
          'Llama 3.1 8B Instant',
          'Lightweight categorization and short answers.',
        ),
      ],
    },
    deepseek: {
      id: 'deepseek',
      label: 'DeepSeek',
      description: 'Text and reasoning models with JSON output.',
      envKey: 'DEEPSEEK_API_KEY',
      docsUrl: 'https://platform.deepseek.com/api_keys',
      models: [
        model('deepseek-flash', 'DeepSeek Flash', 'Everyday analysis and structured text.', 32768),
        model('deepseek-v4-pro', 'DeepSeek V4 Pro', 'Detailed text analysis.', 32768),
      ],
    },
    mistral: {
      id: 'mistral',
      label: 'Mistral AI',
      description: 'Mistral models for multilingual text and extraction.',
      envKey: 'MISTRAL_API_KEY',
      docsUrl: 'https://console.mistral.ai/api-keys',
      models: [
        model('mistral-small-latest', 'Mistral Small', 'Compact multilingual text model.', 32768),
        model(
          'mistral-large-latest',
          'Mistral Large',
          'Detailed analysis and structured text.',
          32768,
        ),
      ],
    },
  },
  // Retained only for older API clients; feature execution never inherits these.
  defaultProvider: 'gemini',
  defaultModel: 'gemini-2.5-flash',
  disclosures: {
    adminPaidNotice: 'Platform-managed keys use the platform provider account and its limits.',
    personalKeyNotice:
      'Dedicated keys are encrypted. Usage is billed by the provider to the key owner.',
    dataTransferNotice:
      'Validation sends a small synthetic prompt only. Feature execution sends relevant data to the provider you select.',
  },
};

function isValidProvider(providerId) {
  return typeof providerId === 'string' && Object.hasOwn(AI_CATALOGUE.providers, providerId);
}

function isValidModel(providerId, modelId) {
  const provider = AI_CATALOGUE.providers[providerId];
  if (!isValidProvider(providerId)) return false;
  return provider.models.some((m) => m.id === modelId);
}

function getProvider(providerId) {
  return AI_CATALOGUE.providers[providerId] || AI_CATALOGUE.providers[AI_CATALOGUE.defaultProvider];
}

module.exports = {
  AI_CATALOGUE,
  isValidProvider,
  isValidModel,
  getProvider,
};
