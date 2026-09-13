import { formatCustomDate, formatCustomDateTime } from '@/lib/formatters';

type DateInput = string | number | Date | null | undefined;

const padDatePart = (value: number | string): string => String(value).padStart(2, '0');

function getStoredDateFormat(): string {
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

function getStoredTimeFormat(): string {
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

export function formatDate(dateInput: DateInput, formatPreference?: string): string {
  if (!dateInput) return '';
  const fmt = formatPreference || getStoredDateFormat();
  return formatCustomDate(dateInput, fmt);
}

export function formatDateTime(
  dateInput: DateInput,
  dateFormatPreference?: string,
  timeFormatPreference?: string,
  timezone = 'Asia/Kolkata',
): string {
  if (!dateInput) return '';
  const dateFmt = dateFormatPreference || getStoredDateFormat();
  const timeFmt = timeFormatPreference || getStoredTimeFormat();
  return formatCustomDateTime(dateInput, dateFmt, timeFmt, timezone);
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
