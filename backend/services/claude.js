const {
  generateJsonArray,
  getProviderConfig,
  isProviderConfigured,
  normalizeProviderId,
} = require('./ai');

const CATEGORIES = [
  'Income',
  'Salary',
  'Rent',
  'Utilities',
  'Food',
  'Transport',
  'Entertainment',
  'Shopping',
  'Investment',
  'Other',
];

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // ms

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function categorizeWithRetry(transactions, providerId, attempt = 0) {
  const provider = normalizeProviderId(providerId);
  try {
    const prompt = `You are a financial transaction categorizer. Categorize each transaction into one of these categories: ${CATEGORIES.join(', ')}.

Transactions to categorize:
${transactions
  .map(
    (t, i) => `
${i + 1}. Date: ${t.date}
   Description: ${t.description}
   Amount: ${t.amount} (${t.type === 'credit' ? 'Income' : 'Expense'})
`,
  )
  .join('\n')}

Respond with a JSON array where each element has:
{
  "index": transaction index (1-based),
  "category": category name,
  "confidence": confidence score (0-1)
}

Respond ONLY with valid JSON array, no other text.`;

    if (!isProviderConfigured(provider)) {
      console.warn(
        `${getProviderConfig(provider).label} is not configured. Skipping AI categorization.`,
      );
      return [];
    }

    const categorizations = await generateJsonArray(prompt, {
      providerId: provider,
      maxTokens: 1024,
    });

    const results = categorizations.map((cat) => ({
      transactionIndex: cat.index - 1,
      category: CATEGORIES.includes(cat.category) ? cat.category : 'Other',
      confidence: Math.min(Math.max(cat.confidence, 0), 1),
    }));

    return results;
  } catch (err) {
    if (attempt < MAX_RETRIES - 1) {
      await sleep(RETRY_DELAY * (attempt + 1));
      return categorizeWithRetry(transactions, provider, attempt + 1);
    }
    throw err;
  }
}

async function categorizeBatch(transactions, providerId) {
  if (!transactions || transactions.length === 0) {
    return [];
  }

  const BATCH_SIZE = 50;
  const results = [];
  const provider = normalizeProviderId(providerId);

  for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
    const batch = transactions.slice(i, i + BATCH_SIZE);
    const batchResults = await categorizeWithRetry(batch, provider);
    results.push(...batchResults);
  }

  return results;
}

module.exports = {
  categorizeBatch,
  CATEGORIES,
};
