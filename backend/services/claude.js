const Anthropic = require('@anthropic-ai/sdk');

let client = null;

function getClient() {
  if (!client) {
    client = new Anthropic.default();
  }
  return client;
}

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

async function categorizeWithRetry(transactions, attempt = 0) {
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

    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured. Get your key from https://console.anthropic.com/account/keys');
    }

    const message = await getClient().messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);

    if (!jsonMatch) {
      throw new Error('Invalid response format from Claude');
    }

    const categorizations = JSON.parse(jsonMatch[0]);

    const results = categorizations.map((cat) => ({
      transactionIndex: cat.index - 1,
      category: CATEGORIES.includes(cat.category) ? cat.category : 'Other',
      confidence: Math.min(Math.max(cat.confidence, 0), 1),
    }));

    return results;
  } catch (err) {
    if (attempt < MAX_RETRIES - 1) {
      await sleep(RETRY_DELAY * (attempt + 1));
      return categorizeWithRetry(transactions, attempt + 1);
    }
    throw err;
  }
}

async function categorizeBatch(transactions) {
  if (!transactions || transactions.length === 0) {
    return [];
  }

  const BATCH_SIZE = 50;
  const results = [];

  for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
    const batch = transactions.slice(i, i + BATCH_SIZE);
    const batchResults = await categorizeWithRetry(batch);
    results.push(...batchResults);
  }

  return results;
}

module.exports = {
  categorizeBatch,
  CATEGORIES,
};
