const pool = require('../config/db');
const { BASELINE_RATES, getCachedRates } = require('./exchangeRateService');

// Baseline exchange rates benchmarked to USD (backward compatibility)
const CURRENCY_RATES = BASELINE_RATES;

// Pricing rates benchmarked to public Google Cloud / AWS infrastructure and Gemini / Anthropic API token pricing
const RATES_USD = {
  // AI Costs per operation (Admin-managed mode)
  geminiStatementParsing: 0.0015, // ~15,000 input tokens + 1,500 output tokens on Gemini 2.5 Flash
  claudeStatementParsing: 0.015, // ~15,000 input tokens + 1,500 output tokens on Claude 3.5 Sonnet
  aiCategorizationPerTxn: 0.00002, // ~40 tokens per transaction categorization
  aiChatPerMessage: 0.0005, // ~800 input tokens + 300 output tokens
  // Infrastructure Costs per month
  encryptedStoragePerMB: 0.00003, // Cloud storage @ ~$0.03/GB/month with backup redundancy
  dbComputePerTxn: 0.000002, // PostgreSQL storage & indexing overhead per active transaction
  baseInfraAllocation: 0.01, // Base tenancy allocation (session auth, DNS, ingress)
};

function formatBytes(bytes) {
  if (bytes === 0) return '0 KB';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Aggregates actual user resource consumption and computes transparent cost-to-serve.
 * @param {string} userId
 * @returns {Promise<object>}
 */
async function getUserCostTransparency(userId) {
  // 1. Fetch user account profile & preferences
  const userRes = await pool.query(
    'SELECT id, currency, selected_ai_provider, selected_ai_model, ai_key_mode FROM users WHERE id = $1',
    [userId],
  );

  if (userRes.rows.length === 0) {
    throw new Error('User not found');
  }

  const user = userRes.rows[0];
  const userCurrency = user.currency || 'INR';
  const { rates: currentRates } = getCachedRates();
  const exchangeRate = currentRates[userCurrency] || currentRates.INR || CURRENCY_RATES.INR;
  const isByok = user.ai_key_mode === 'personal';
  const aiProvider = user.selected_ai_provider || 'gemini';
  const aiModel = user.selected_ai_model || 'gemini-2.5-flash';

  // 2. Fetch actual statements processed
  const statementsRes = await pool.query(
    `SELECT 
       COUNT(*) FILTER (WHERE status = 'completed') AS completed_count,
       COUNT(*) AS total_count
     FROM statements WHERE user_id = $1`,
    [userId],
  );
  const statementsCompleted = parseInt(statementsRes.rows[0].completed_count || 0, 10);
  const statementsTotal = parseInt(statementsRes.rows[0].total_count || 0, 10);

  // 3. Fetch total storage bytes of statement files
  const storageRes = await pool.query(
    `SELECT COALESCE(SUM(LENGTH(content)), 0) AS total_bytes
     FROM statement_files sf
     JOIN statements s ON sf.statement_id = s.id
     WHERE s.user_id = $1`,
    [userId],
  );
  const storageBytes = parseInt(storageRes.rows[0].total_bytes || 0, 10);
  const storageMB = storageBytes / (1024 * 1024);

  // 4. Fetch transactions count
  const txnsRes = await pool.query(
    'SELECT COUNT(*) AS total_txns FROM transactions WHERE user_id = $1',
    [userId],
  );
  const totalTransactions = parseInt(txnsRes.rows[0].total_txns || 0, 10);

  // 5. Fetch assistant chat messages count
  const chatRes = await pool.query(
    'SELECT COUNT(*) AS total_messages FROM chat_messages WHERE user_id = $1',
    [userId],
  );
  const totalChatMessages = parseInt(chatRes.rows[0].total_messages || 0, 10);

  // 6. Compute costs in USD
  const parseRate =
    aiProvider === 'anthropic'
      ? RATES_USD.claudeStatementParsing
      : RATES_USD.geminiStatementParsing;

  let aiParsingCostUSD = 0;
  let aiCategorizationCostUSD = 0;
  let aiChatCostUSD = 0;

  if (!isByok) {
    aiParsingCostUSD = statementsTotal * parseRate;
    aiCategorizationCostUSD = totalTransactions * RATES_USD.aiCategorizationPerTxn;
    aiChatCostUSD = totalChatMessages * RATES_USD.aiChatPerMessage;
  }

  const totalAiCostUSD = aiParsingCostUSD + aiCategorizationCostUSD + aiChatCostUSD;

  // Infrastructure costs
  const storageCostUSD = Math.max(0.001, storageMB * RATES_USD.encryptedStoragePerMB);
  const computeCostUSD =
    RATES_USD.baseInfraAllocation + totalTransactions * RATES_USD.dbComputePerTxn;
  const totalInfraCostUSD = storageCostUSD + computeCostUSD;

  const totalPlatformCostUSD = totalAiCostUSD + totalInfraCostUSD;

  // Convert to user currency
  const toUserCurr = (usd) => parseFloat((usd * exchangeRate).toFixed(3));

  return {
    currency: userCurrency,
    exchange_rate: exchangeRate,
    is_byok: isByok,
    ai_provider: aiProvider,
    ai_model: aiModel,
    usage: {
      statements_processed: statementsCompleted,
      statements_total: statementsTotal,
      transactions_count: totalTransactions,
      chat_messages_count: totalChatMessages,
      storage_bytes: storageBytes,
      storage_formatted: formatBytes(storageBytes),
    },
    costs: {
      ai_parsing_cost: toUserCurr(aiParsingCostUSD),
      ai_categorization_cost: toUserCurr(aiCategorizationCostUSD),
      ai_chat_cost: toUserCurr(aiChatCostUSD),
      total_ai_cost: toUserCurr(totalAiCostUSD),
      storage_cost: toUserCurr(storageCostUSD),
      compute_cost: toUserCurr(computeCostUSD),
      total_infra_cost: toUserCurr(totalInfraCostUSD),
      total_platform_cost: toUserCurr(totalPlatformCostUSD),
      // Raw USD figures for auditing
      raw_usd: {
        total_ai_cost: parseFloat(totalAiCostUSD.toFixed(4)),
        total_infra_cost: parseFloat(totalInfraCostUSD.toFixed(4)),
        total_platform_cost: parseFloat(totalPlatformCostUSD.toFixed(4)),
      },
    },
    disclosures: {
      byok_notice: isByok
        ? 'Your account is in Personal API Key (BYOK) mode. AI model calls are billed directly to your provider key, resulting in zero AI cost incurred by Finlytix.'
        : 'Your account is using Finlytix-managed AI keys. The displayed AI cost reflects real model token consumption incurred on your behalf.',
      rates_notice:
        'Infrastructure rates are based on public cloud compute and AES-256-GCM encrypted database storage pricing.',
      transparency_commitment:
        'In accordance with our user information rights commitment, we believe every user has the right to inspect the exact computational and financial resources required to power their account.',
    },
  };
}

module.exports = {
  getUserCostTransparency,
  RATES_USD,
  CURRENCY_RATES,
};
