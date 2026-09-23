import { useState, useEffect } from 'react';
import {
  formatCustomDate,
  formatCustomDateTime,
  hasTimeComponent,
  formatMonthYear,
} from '@/lib/formatters';
import {
  getStoredCurrency,
  getStoredLocale,
  convertCurrency,
  formatMoney,
  CURRENCY_RATES,
  fetchLiveExchangeRates,
  getRatesLastUpdated,
} from './currency';
import { getStoredLanguage } from './translations';

export {
  formatMonthYear,
  getStoredCurrency,
  getStoredLocale,
  convertCurrency,
  formatMoney,
  CURRENCY_RATES,
  fetchLiveExchangeRates,
  getRatesLastUpdated,
};

type DateInput = string | number | Date | null | undefined;

const padDatePart = (value: number | string): string => String(value).padStart(2, '0');

export function getStoredDateFormat(): string {
  if (typeof window === 'undefined') return 'DD/MM/YYYY';
  try {
    const raw = localStorage.getItem('user');
    if (raw) {
      const user = JSON.parse(raw);
      if (user?.date_format) return user.date_format;
    }
  } catch {
    // fallback
  }
  return 'DD/MM/YYYY';
}

export function getStoredTimeFormat(): string {
  if (typeof window === 'undefined') return '12h';
  try {
    const raw = localStorage.getItem('user');
    if (raw) {
      const user = JSON.parse(raw);
      if (user?.time_format) return user.time_format;
    }
  } catch {
    // fallback
  }
  return '12h';
}

export function getStoredTimezone(): string {
  if (typeof window === 'undefined') return 'Asia/Kolkata';
  try {
    const raw = localStorage.getItem('user');
    if (raw) {
      const user = JSON.parse(raw);
      if (user?.timezone) return user.timezone;
    }
  } catch {
    // fallback
  }
  return 'Asia/Kolkata';
}

export function notifyPreferencesChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('finlytix-preferences-updated'));
}

export function useUserPreferences() {
  const [prefs, setPrefs] = useState(() => ({
    dateFormat: getStoredDateFormat(),
    timeFormat: getStoredTimeFormat(),
    timezone: getStoredTimezone(),
    currency: getStoredCurrency(),
    locale: getStoredLocale(),
    language: getStoredLanguage(),
  }));
  const [ratesUpdated, setRatesUpdated] = useState<string | null>(() => getRatesLastUpdated());

  useEffect(() => {
    // Hydrate live exchange rates on mount
    fetchLiveExchangeRates();

    const update = () => {
      setPrefs({
        dateFormat: getStoredDateFormat(),
        timeFormat: getStoredTimeFormat(),
        timezone: getStoredTimezone(),
        currency: getStoredCurrency(),
        locale: getStoredLocale(),
        language: getStoredLanguage(),
      });
      setRatesUpdated(getRatesLastUpdated());
    };
    window.addEventListener('finlytix-preferences-updated', update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener('finlytix-preferences-updated', update);
      window.removeEventListener('storage', update);
    };
  }, []);

  const convertMoney = (amount: number, fromCurrency = 'INR') =>
    convertCurrency(amount, fromCurrency, prefs.currency);

  const formatMoneyAmount = (amount: number | string | null | undefined, fromCurrency = 'INR') =>
    formatMoney(amount, prefs.currency, fromCurrency, prefs.locale);

  const refreshRates = () => fetchLiveExchangeRates(true);

  return {
    ...prefs,
    ratesUpdated,
    refreshRates,
    convertMoney,
    formatMoney: formatMoneyAmount,
  };
}

export function formatDate(dateInput: DateInput, formatPreference?: string): string {
  if (!dateInput) return '';
  if (hasTimeComponent(dateInput)) {
    return formatDateTime(dateInput, formatPreference);
  }
  const fmt = formatPreference || getStoredDateFormat();
  return formatCustomDate(dateInput, fmt);
}

export function formatDateTime(
  dateInput: DateInput,
  dateFormatPreference?: string,
  timeFormatPreference?: string,
  timezone?: string,
): string {
  if (!dateInput) return '';
  const dateFmt = dateFormatPreference || getStoredDateFormat();
  const timeFmt = timeFormatPreference || getStoredTimeFormat();
  const tz = timezone || getStoredTimezone();
  return formatCustomDateTime(dateInput, dateFmt, timeFmt, tz);
}

export function parseDisplayDateToIso(dateInput: string): string | null {
  if (!dateInput) return null;
  const trimmed = dateInput.trim();

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // DD/MM/YYYY or MM/DD/YYYY
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, first, second, yearValue] = slashMatch;
    // Default to DD/MM/YYYY
    const day = Number(first);
    const month = Number(second);
    const year = Number(yearValue);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      return null;
    }
    return `${yearValue}-${padDatePart(month)}-${padDatePart(day)}`;
  }

  // Try Date.parse
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return `${parsed.getUTCFullYear()}-${padDatePart(parsed.getUTCMonth() + 1)}-${padDatePart(parsed.getUTCDate())}`;
  }

  return null;
}
