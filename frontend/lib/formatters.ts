export const SUPPORTED_CURRENCIES = [
  { code: 'INR', symbol: '₹', label: 'INR (₹) - Indian Rupee' },
  { code: 'USD', symbol: '$', label: 'USD ($) - US Dollar' },
  { code: 'EUR', symbol: '€', label: 'EUR (€) - Euro' },
  { code: 'GBP', symbol: '£', label: 'GBP (£) - British Pound' },
  { code: 'AED', symbol: 'AED', label: 'AED (AED) - UAE Dirham' },
  { code: 'SGD', symbol: 'S$', label: 'SGD (S$) - Singapore Dollar' },
  { code: 'CAD', symbol: 'CA$', label: 'CAD (CA$) - Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', label: 'AUD (A$) - Australian Dollar' },
  { code: 'JPY', symbol: '¥', label: 'JPY (¥) - Japanese Yen' },
];

export const SUPPORTED_LOCALES = [
  { code: 'en-IN', label: 'English (India)' },
  { code: 'en-US', label: 'English (United States)' },
  { code: 'en-GB', label: 'English (United Kingdom)' },
  { code: 'hi-IN', label: 'Hindi (India)' },
  { code: 'ta-IN', label: 'Tamil (India)' },
  { code: 'te-IN', label: 'Telugu (India)' },
];

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी' },
  { code: 'ta', label: 'Tamil', nativeLabel: 'தமிழ்' },
  { code: 'te', label: 'Telugu', nativeLabel: 'తెలుగు' },
  { code: 'bn', label: 'Bengali', nativeLabel: 'বাংলা' },
  { code: 'mr', label: 'Marathi', nativeLabel: 'मराठी' },
  { code: 'gu', label: 'Gujarati', nativeLabel: 'ગુજરાતી' },
  { code: 'kn', label: 'Kannada', nativeLabel: 'ಕನ್ನಡ' },
  { code: 'ml', label: 'Malayalam', nativeLabel: 'മലയാളം' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español' },
  { code: 'fr', label: 'French', nativeLabel: 'Français' },
  { code: 'de', label: 'German', nativeLabel: 'Deutsch' },
];

export const SUPPORTED_TIMEZONES = [
  { code: 'Asia/Kolkata', label: 'India Standard Time (IST - Asia/Kolkata)' },
  { code: 'UTC', label: 'Coordinated Universal Time (UTC)' },
  { code: 'Asia/Dubai', label: 'Gulf Standard Time (GST - Asia/Dubai)' },
  { code: 'Asia/Singapore', label: 'Singapore Time (SGT - Asia/Singapore)' },
  { code: 'Europe/London', label: 'London Time (GMT/BST - Europe/London)' },
  { code: 'America/New_York', label: 'Eastern Time (ET - America/New_York)' },
  { code: 'America/Los_Angeles', label: 'Pacific Time (PT - America/Los_Angeles)' },
];

export const SUPPORTED_DATE_FORMATS = [
  { code: 'DD/MM/YYYY', label: 'DD/MM/YYYY (e.g. 15/01/2026)', sample: '15/01/2026' },
  { code: 'MM/DD/YYYY', label: 'MM/DD/YYYY (e.g. 01/15/2026)', sample: '01/15/2026' },
  { code: 'YYYY-MM-DD', label: 'YYYY-MM-DD (e.g. 2026-01-15)', sample: '2026-01-15' },
  { code: 'DD MMM YYYY', label: 'DD MMM YYYY (e.g. 15 Jan 2026)', sample: '15 Jan 2026' },
  { code: 'MMM DD, YYYY', label: 'MMM DD, YYYY (e.g. Jan 15, 2026)', sample: 'Jan 15, 2026' },
];

export const SUPPORTED_TIME_FORMATS = [
  { code: '12h', label: '12-Hour (e.g. 02:30 PM)', sample: '02:30 PM' },
  { code: '24h', label: '24-Hour (e.g. 14:30)', sample: '14:30' },
];

const MONTH_NAMES_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const MONTH_NAMES_FULL = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function formatMonthYear(monthStr?: string | null): string {
  if (!monthStr) return '—';
  const match = String(monthStr)
    .trim()
    .match(/^(\d{4})-(\d{2})/);
  if (!match) return String(monthStr);
  const year = match[1];
  const monthIdx = parseInt(match[2], 10) - 1;
  const fullMonth = MONTH_NAMES_FULL[monthIdx] || match[2];
  return `${fullMonth} ${year}`;
}

export function hasTimeComponent(dateInput: string | Date | number | null | undefined): boolean {
  if (!dateInput) return false;
  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed) || /^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(trimmed)) {
      return false;
    }
    return trimmed.includes('T') || trimmed.includes(':');
  }
  if (dateInput instanceof Date) {
    if (isNaN(dateInput.getTime())) return false;
    return (
      dateInput.getHours() !== 0 || dateInput.getMinutes() !== 0 || dateInput.getSeconds() !== 0
    );
  }
  if (typeof dateInput === 'number') {
    return true;
  }
  return false;
}

export function formatCustomDate(
  dateInput: string | Date | number | null | undefined,
  dateFormat = 'DD/MM/YYYY',
): string {
  if (!dateInput) return '';

  let year: number;
  let month: number; // 1-12
  let day: number; // 1-31

  if (typeof dateInput === 'string') {
    const isoMatch = dateInput.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      year = parseInt(isoMatch[1], 10);
      month = parseInt(isoMatch[2], 10);
      day = parseInt(isoMatch[3], 10);
    } else {
      const d = new Date(dateInput);
      if (isNaN(d.getTime())) return dateInput;
      year = d.getFullYear();
      month = d.getMonth() + 1;
      day = d.getDate();
    }
  } else if (dateInput instanceof Date) {
    if (isNaN(dateInput.getTime())) return '';
    year = dateInput.getFullYear();
    month = dateInput.getMonth() + 1;
    day = dateInput.getDate();
  } else if (typeof dateInput === 'number') {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '';
    year = d.getFullYear();
    month = d.getMonth() + 1;
    day = d.getDate();
  } else {
    return '';
  }

  const dayStr = String(day).padStart(2, '0');
  const monthStr = String(month).padStart(2, '0');
  const monthName = MONTH_NAMES_SHORT[month - 1] || monthStr;

  switch (dateFormat) {
    case 'MM/DD/YYYY':
      return `${monthStr}/${dayStr}/${year}`;
    case 'YYYY-MM-DD':
      return `${year}-${monthStr}-${dayStr}`;
    case 'DD MMM YYYY':
      return `${dayStr} ${monthName} ${year}`;
    case 'MMM DD, YYYY':
      return `${monthName} ${dayStr}, ${year}`;
    case 'DD/MM/YYYY':
    default:
      return `${dayStr}/${monthStr}/${year}`;
  }
}

export function formatCustomDateTime(
  dateInput: string | Date | number | null | undefined,
  dateFormat = 'DD/MM/YYYY',
  timeFormat = '12h',
  timezone = 'Asia/Kolkata',
): string {
  if (!dateInput) return '';
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);

  const datePart = formatCustomDate(d, dateFormat);

  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');

  try {
    const timeParts = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: timeFormat === '12h',
      timeZone: timezone,
    }).format(d);
    return `${datePart}, ${timeParts}`;
  } catch {
    if (timeFormat === '24h') {
      return `${datePart}, ${String(hours).padStart(2, '0')}:${minutes}`;
    }
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${datePart}, ${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
  }
}

export function formatCurrency(
  value: number | string | null | undefined,
  currency = 'INR',
  locale = 'en-IN',
): string {
  const num = Number(value || 0);
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    const symbolMatch = SUPPORTED_CURRENCIES.find((c) => c.code === currency);
    const sym = symbolMatch ? symbolMatch.symbol : `${currency} `;
    return `${sym}${num.toLocaleString(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
}

export function formatDate(
  dateInput: string | Date | null | undefined,
  locale = 'en-IN',
  timezone = 'Asia/Kolkata',
  options?: Intl.DateTimeFormatOptions,
): string {
  if (!dateInput) return '';
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) return String(dateInput);

  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: timezone,
    ...options,
  };

  try {
    return new Intl.DateTimeFormat(locale, defaultOptions).format(date);
  } catch {
    return date.toISOString().split('T')[0];
  }
}

export function formatNumber(
  value: number | string | null | undefined,
  locale = 'en-IN',
  options?: Intl.NumberFormatOptions,
): string {
  const num = Number(value || 0);
  try {
    return new Intl.NumberFormat(locale, options).format(num);
  } catch {
    return String(num);
  }
}
