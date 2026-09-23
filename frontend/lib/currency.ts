import { formatCurrency, SUPPORTED_CURRENCIES } from './formatters';

// Baseline exchange rates benchmarked to USD (fallback)
export const CURRENCY_RATES: Record<string, number> = {
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

// In-memory dynamic rates cache
let activeRates: Record<string, number> = { ...CURRENCY_RATES };
let ratesLastUpdated: string | null = null;
let isFetchingRates = false;

// Hydrate from localStorage on client-side
if (typeof window !== 'undefined') {
  try {
    const cached = localStorage.getItem('finlytix_exchange_rates');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed?.rates && typeof parsed.rates === 'object') {
        activeRates = { ...CURRENCY_RATES, ...parsed.rates };
        ratesLastUpdated = parsed.updated_at || null;
      }
    }
  } catch {
    // ignore
  }
}

export function getActiveRates(): Record<string, number> {
  return activeRates;
}

export function getRatesLastUpdated(): string | null {
  return ratesLastUpdated;
}

/**
 * Fetches live exchange rates from the backend /api/analytics/exchange-rates endpoint.
 * Caches in memory and localStorage, and notifies subscribers.
 */
export async function fetchLiveExchangeRates(
  forceRefresh = false,
): Promise<Record<string, number>> {
  if (typeof window === 'undefined') return activeRates;
  if (isFetchingRates && !forceRefresh) return activeRates;

  try {
    isFetchingRates = true;
    const token = localStorage.getItem('token');
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const query = forceRefresh ? '?refresh=true' : '';

    const res = await fetch(`${apiUrl}/api/analytics/exchange-rates${query}`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (res.ok) {
      const data = await res.json();
      if (data?.rates) {
        activeRates = { ...CURRENCY_RATES, ...data.rates };
        ratesLastUpdated = data.updated_at || new Date().toISOString();
        localStorage.setItem(
          'finlytix_exchange_rates',
          JSON.stringify({
            rates: activeRates,
            updated_at: ratesLastUpdated,
          }),
        );
        window.dispatchEvent(new Event('finlytix-preferences-updated'));
      }
    }
  } catch (err) {
    console.warn('[Currency] Could not fetch live exchange rates, using cached/baseline:', err);
  } finally {
    isFetchingRates = false;
  }

  return activeRates;
}

export function getStoredCurrency(): string {
  if (typeof window === 'undefined') return 'INR';
  try {
    const raw = localStorage.getItem('user');
    if (raw) {
      const user = JSON.parse(raw);
      if (user?.currency) return user.currency;
    }
  } catch {
    // fallback
  }
  return 'INR';
}

export function getStoredLocale(): string {
  if (typeof window === 'undefined') return 'en-IN';
  try {
    const raw = localStorage.getItem('user');
    if (raw) {
      const user = JSON.parse(raw);
      if (user?.locale) return user.locale;
    }
  } catch {
    // fallback
  }
  return 'en-IN';
}

export function getCurrencySymbol(code: string): string {
  const match = SUPPORTED_CURRENCIES.find((c) => c.code === code);
  return match ? match.symbol : code;
}

/**
 * Converts a financial amount between currencies using live or benchmark exchange rates.
 * Default base currency in storage is INR.
 */
export function convertCurrency(
  amount: number,
  fromCurrency: string = 'INR',
  toCurrency?: string,
): number {
  if (isNaN(amount) || amount === 0) return 0;
  const targetCurrency = toCurrency || getStoredCurrency();
  if (fromCurrency === targetCurrency) return amount;

  const rates = activeRates;
  const fromRate = rates[fromCurrency] ?? rates.INR ?? CURRENCY_RATES.INR;
  const toRate = rates[targetCurrency] ?? rates.INR ?? CURRENCY_RATES.INR;

  // Convert to USD benchmark pivot, then to target currency
  const inUSD = amount / fromRate;
  const converted = inUSD * toRate;
  return converted;
}

/**
 * Converts an amount from source currency (default INR) to target currency (default user's preference)
 * and formats it with the correct currency symbol and number locale formatting.
 */
export function formatMoney(
  amount: number | string | null | undefined,
  targetCurrency?: string,
  fromCurrency: string = 'INR',
  locale?: string,
): string {
  if (amount === null || amount === undefined || amount === '') return '—';
  const num = typeof amount === 'string' ? parseFloat(amount) : Number(amount);
  if (isNaN(num)) return '—';

  const toCurr = targetCurrency || getStoredCurrency();
  const loc = locale || getStoredLocale();
  const converted = convertCurrency(num, fromCurrency, toCurr);

  return formatCurrency(converted, toCurr, loc);
}
