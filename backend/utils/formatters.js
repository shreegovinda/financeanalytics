const SUPPORTED_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'CAD', 'AUD', 'JPY'];

const CURRENCY_SYMBOLS = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
  AED: 'AED',
  SGD: 'S$',
  CAD: 'CA$',
  AUD: 'A$',
  JPY: '¥',
};

const SUPPORTED_LANGUAGES = [
  'en',
  'hi',
  'ta',
  'te',
  'bn',
  'mr',
  'gu',
  'kn',
  'ml',
  'es',
  'fr',
  'de',
];

const SUPPORTED_DATE_FORMATS = [
  'DD/MM/YYYY',
  'MM/DD/YYYY',
  'YYYY-MM-DD',
  'DD MMM YYYY',
  'MMM DD, YYYY',
];

const SUPPORTED_TIME_FORMATS = ['12h', '24h'];

function isValidCurrency(code) {
  return typeof code === 'string' && /^[A-Z]{3}$/.test(code);
}

function isValidTimezone(tz) {
  if (typeof tz !== 'string' || !tz.trim()) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function isValidLocale(locale) {
  if (typeof locale !== 'string' || !locale.trim()) return false;
  try {
    Intl.DateTimeFormat(locale);
    return true;
  } catch {
    return false;
  }
}

function isValidLanguage(lang) {
  return typeof lang === 'string' && /^[a-z]{2,3}(-[A-Za-z0-9]+)?$/.test(lang);
}

function isValidDateFormat(format) {
  return typeof format === 'string' && SUPPORTED_DATE_FORMATS.includes(format.trim());
}

function isValidTimeFormat(format) {
  return typeof format === 'string' && SUPPORTED_TIME_FORMATS.includes(format.trim());
}

function formatCurrency(amount, currency = 'INR', locale = 'en-IN') {
  const num = Number(amount || 0);
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    const symbol = CURRENCY_SYMBOLS[currency] || `${currency} `;
    return `${symbol}${num.toFixed(2)}`;
  }
}

function formatDate(dateInput, locale = 'en-IN', timezone = 'Asia/Kolkata', options = {}) {
  if (!dateInput) return '';

  // Handle statement month strings (YYYY-MM)
  if (typeof dateInput === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(dateInput.trim())) {
    const [yearStr, monthStr] = dateInput.trim().split('-');
    const date = new Date(Date.UTC(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, 1));
    const monthOptions = {
      year: 'numeric',
      month: 'short',
      timeZone: 'UTC',
      ...options,
    };
    try {
      return new Intl.DateTimeFormat(locale, monthOptions).format(date);
    } catch {
      return dateInput.trim();
    }
  }

  // Handle date-only strings (YYYY-MM-DD) without timezone distortion
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    const [yearStr, monthStr, dayStr] = dateInput.trim().split('-');
    const date = new Date(
      Date.UTC(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, parseInt(dayStr, 10)),
    );
    const dayOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
      ...options,
    };
    try {
      return new Intl.DateTimeFormat(locale, dayOptions).format(date);
    } catch {
      return dateInput.trim();
    }
  }

  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) return String(dateInput);

  const defaultOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: isValidTimezone(timezone) ? timezone : 'Asia/Kolkata',
    ...options,
  };

  try {
    return new Intl.DateTimeFormat(locale, defaultOptions).format(date);
  } catch {
    return date.toISOString().split('T')[0];
  }
}

function formatReportDate(val) {
  if (!val) return 'N/A';
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) {
    const parts = val.slice(0, 10).split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const d = new Date(Date.UTC(year, month, day));
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
  const d = val instanceof Date ? val : new Date(val);
  if (isNaN(d.getTime())) return String(val);
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatReportMonth(val) {
  if (!val) return 'N/A';
  const str = String(val).trim();
  const match = str.match(/^(\d{4})-(\d{2})/);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const d = new Date(Date.UTC(year, month, 1));
    return d.toLocaleDateString('en-GB', {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
  return formatReportDate(val);
}

function formatReportDateTime(val, timezone = 'Asia/Kolkata') {
  if (!val) return 'N/A';
  const d = val instanceof Date ? val : new Date(val);
  if (isNaN(d.getTime())) return String(val);
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: isValidTimezone(timezone) ? timezone : 'Asia/Kolkata',
    }).format(d);
  } catch {
    return d.toISOString().replace('T', ' ').slice(0, 16);
  }
}

function formatReportCurrency(amount, currency = 'INR', locale = 'en-IN', showSign = false) {
  const num = Number(amount || 0);
  const absNum = Math.abs(num);
  const effectiveLocale = locale === 'hi-IN' || !isValidLocale(locale) ? 'en-IN' : locale;
  const formattedNum = new Intl.NumberFormat(effectiveLocale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(absNum);

  const currCode = currency || 'INR';
  if (showSign) {
    if (num > 0) return `+ ${currCode} ${formattedNum}`;
    if (num < 0) return `- ${currCode} ${formattedNum}`;
    return `${currCode} ${formattedNum}`;
  }

  if (num < 0) return `- ${currCode} ${formattedNum}`;
  return `${currCode} ${formattedNum}`;
}

function formatNumber(value, locale = 'en-IN', options = {}) {
  const num = Number(value || 0);
  try {
    return new Intl.NumberFormat(locale, options).format(num);
  } catch {
    return String(num);
  }
}

function toSqlDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value).slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

module.exports = {
  SUPPORTED_CURRENCIES,
  CURRENCY_SYMBOLS,
  SUPPORTED_LANGUAGES,
  isValidCurrency,
  isValidTimezone,
  isValidLocale,
  isValidLanguage,
  SUPPORTED_DATE_FORMATS,
  SUPPORTED_TIME_FORMATS,
  isValidDateFormat,
  isValidTimeFormat,
  formatCurrency,
  formatDate,
  formatNumber,
  formatReportDate,
  formatReportMonth,
  formatReportDateTime,
  formatReportCurrency,
  toSqlDate,
};
