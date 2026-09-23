const axios = require('axios');

/**
 * Baseline exchange rates benchmarked to 1 USD as a resilient offline fallback.
 */
const BASELINE_RATES = {
  USD: 1.0,
  INR: 86.5,
  EUR: 0.95,
  GBP: 0.79,
  AED: 3.67,
  SGD: 1.34,
  CAD: 1.41,
  AUD: 1.56,
  JPY: 154.0,
};

// Supported 3-letter currency codes across Finlytix
const SUPPORTED_CURRENCY_CODES = Object.keys(BASELINE_RATES);

// In-memory cache for live internet rates
let memoryCache = {
  base: 'USD',
  rates: { ...BASELINE_RATES },
  updatedAt: null,
  source: 'baseline',
};

// 30-minute cache TTL to respect API limits while reflecting live market changes
const CACHE_TTL_MS = 30 * 60 * 1000;

/**
 * Normalizes an external rates map into Finlytix supported currencies.
 * Ensures all supported currencies have positive numeric rates.
 */
function normalizeRates(rawRates) {
  const normalized = { ...BASELINE_RATES };
  if (!rawRates || typeof rawRates !== 'object') {
    return normalized;
  }

  for (const code of SUPPORTED_CURRENCY_CODES) {
    const val = Number(rawRates[code]);
    if (Number.isFinite(val) && val > 0) {
      normalized[code] = val;
    }
  }

  // USD benchmark is always 1.0
  normalized.USD = 1.0;
  return normalized;
}

/**
 * Fetches live exchange rates from public, reliable exchange rate APIs.
 * Tries open.er-api.com first, then frankfurter.dev, then falls back to memory cache / baseline.
 *
 * @param {object} [options]
 * @param {boolean} [options.forceRefresh=false]
 * @returns {Promise<{base: string, rates: Record<string, number>, updated_at: string, source: string}>}
 */
async function getLiveRates({ forceRefresh = false } = {}) {
  const now = Date.now();

  // Return in-memory cache if still within TTL
  if (
    !forceRefresh &&
    memoryCache.updatedAt &&
    now - new Date(memoryCache.updatedAt).getTime() < CACHE_TTL_MS
  ) {
    return {
      base: 'USD',
      rates: { ...memoryCache.rates },
      updated_at: memoryCache.updatedAt,
      source: memoryCache.source,
    };
  }

  // 1. Try primary live API: open.er-api.com (free, high availability, keyless)
  try {
    const res = await axios.get('https://open.er-api.com/v6/latest/USD', {
      timeout: 5000,
      headers: { Accept: 'application/json' },
    });

    if (res.data && res.data.result === 'success' && res.data.rates) {
      const liveRates = normalizeRates(res.data.rates);
      const timestamp = new Date().toISOString();
      memoryCache = {
        base: 'USD',
        rates: liveRates,
        updatedAt: timestamp,
        source: 'live:open.er-api.com',
      };

      return {
        base: 'USD',
        rates: { ...memoryCache.rates },
        updated_at: timestamp,
        source: 'live',
      };
    }
  } catch (err) {
    console.warn(
      '[ExchangeRateService] Primary rates provider (open.er-api.com) failed:',
      err.message,
    );
  }

  // 2. Try secondary fallback API: European Central Bank via frankfurter.dev
  try {
    const res = await axios.get('https://api.frankfurter.dev/v1/latest?base=USD', {
      timeout: 5000,
      headers: { Accept: 'application/json' },
    });

    if (res.data && res.data.rates) {
      const liveRates = normalizeRates(res.data.rates);
      const timestamp = new Date().toISOString();
      memoryCache = {
        base: 'USD',
        rates: liveRates,
        updatedAt: timestamp,
        source: 'live:frankfurter.dev',
      };

      return {
        base: 'USD',
        rates: { ...memoryCache.rates },
        updated_at: timestamp,
        source: 'live',
      };
    }
  } catch (err) {
    console.warn(
      '[ExchangeRateService] Secondary rates provider (frankfurter.dev) failed:',
      err.message,
    );
  }

  // 3. Fallback to existing cache if available, or baseline
  const updatedAt = memoryCache.updatedAt || new Date().toISOString();
  return {
    base: 'USD',
    rates: { ...memoryCache.rates },
    updated_at: updatedAt,
    source: memoryCache.updatedAt ? 'cache' : 'fallback',
  };
}

/**
 * Synchronous accessor for currently cached exchange rates.
 */
function getCachedRates() {
  return {
    base: 'USD',
    rates: { ...memoryCache.rates },
    updated_at: memoryCache.updatedAt || new Date().toISOString(),
  };
}

/**
 * Converts an amount from one currency to another using the provided or cached exchange rates.
 * Base pivot is USD.
 *
 * @param {number} amount
 * @param {string} fromCurrency
 * @param {string} toCurrency
 * @param {Record<string, number>} [customRates]
 * @returns {number}
 */
function convertAmount(amount, fromCurrency = 'INR', toCurrency = 'INR', customRates = null) {
  const num = Number(amount);
  if (!Number.isFinite(num) || num === 0) return 0;
  if (fromCurrency === toCurrency) return num;

  const rates = customRates || memoryCache.rates;
  const fromRate = rates[fromCurrency] || rates.INR || BASELINE_RATES.INR;
  const toRate = rates[toCurrency] || rates.INR || BASELINE_RATES.INR;

  const inUSD = num / fromRate;
  return inUSD * toRate;
}

module.exports = {
  BASELINE_RATES,
  SUPPORTED_CURRENCY_CODES,
  getLiveRates,
  getCachedRates,
  convertAmount,
  normalizeRates,
};
