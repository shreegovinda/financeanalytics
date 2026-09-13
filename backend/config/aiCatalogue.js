const AI_CATALOGUE = {
  providers: {
    gemini: {
      id: 'gemini',
      label: 'Google Gemini',
      description: 'Google AI models supporting high speed and large context windows.',
      models: [
        {
          id: 'gemini-2.5-flash',
          label: 'Gemini 2.5 Flash',
          description:
            'Fast, responsive model suited for day-to-day analytics and statement queries.',
          isDefault: true,
          maxTokens: 8192,
        },
        {
          id: 'gemini-2.5-pro',
          label: 'Gemini 2.5 Pro',
          description:
            'Advanced reasoning model for complex financial planning and deep data synthesis.',
          isDefault: false,
          maxTokens: 8192,
        },
      ],
      envKey: 'GEMINI_API_KEY',
      docsUrl: 'https://aistudio.google.com/',
    },
    anthropic: {
      id: 'anthropic',
      label: 'Anthropic Claude',
      description: 'Anthropic Claude models designed for nuanced reasoning and clear explanations.',
      models: [
        {
          id: 'claude-3-5-sonnet-20241022',
          label: 'Claude 3.5 Sonnet',
          description: 'High capability model combining speed, precision, and financial reasoning.',
          isDefault: true,
          maxTokens: 8192,
        },
        {
          id: 'claude-3-7-sonnet-20250219',
          label: 'Claude 3.7 Sonnet',
          description: 'Latest Sonnet release with extended thinking capabilities.',
          isDefault: false,
          maxTokens: 8192,
        },
      ],
      envKey: 'ANTHROPIC_API_KEY',
      docsUrl: 'https://console.anthropic.com/',
    },
  },
  defaultProvider: 'gemini',
  defaultModel: 'gemini-2.5-flash',
  disclosures: {
    adminPaidNotice:
      'Admin-managed models are hosted by Finlytix within standard platform usage limits.',
    personalKeyNotice:
      'When using your personal API key (BYOK), prompts and data are billed directly to your provider account. Your personal key is stored with authenticated AES-256-GCM application encryption and is never returned in plaintext to the browser.',
    dataTransferNotice:
      'Statement questions and assistant prompts are sent to the selected AI provider to generate answers. Do not send sensitive authentication credentials or unredacted tax IDs in chat.',
  },
};

function isValidProvider(providerId) {
  return Boolean(AI_CATALOGUE.providers[providerId]);
}

function isValidModel(providerId, modelId) {
  const provider = AI_CATALOGUE.providers[providerId];
  if (!provider) return false;
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
