export const SUPPORTED_CURRENCIES = [
  { code: "INR", symbol: "₹", label: "INR (₹) - Indian Rupee" },
  { code: "USD", symbol: "$", label: "USD ($) - US Dollar" },
  { code: "EUR", symbol: "€", label: "EUR (€) - Euro" },
  { code: "GBP", symbol: "£", label: "GBP (£) - British Pound" },
  { code: "AED", symbol: "AED", label: "AED (AED) - UAE Dirham" },
  { code: "SGD", symbol: "S$", label: "SGD (S$) - Singapore Dollar" },
  { code: "CAD", symbol: "CA$", label: "CAD (CA$) - Canadian Dollar" },
  { code: "AUD", symbol: "A$", label: "AUD (A$) - Australian Dollar" },
  { code: "JPY", symbol: "¥", label: "JPY (¥) - Japanese Yen" },
] as const;

export const SUPPORTED_LOCALES = [
  { code: "en-IN", label: "English (India)" },
  { code: "en-US", label: "English (United States)" },
  { code: "en-GB", label: "English (United Kingdom)" },
  { code: "hi-IN", label: "Hindi (India)" },
  { code: "ta-IN", label: "Tamil (India)" },
  { code: "te-IN", label: "Telugu (India)" },
] as const;

export const SUPPORTED_TIMEZONES = [
  { code: "Asia/Kolkata", label: "India Standard Time (IST - Asia/Kolkata)" },
  { code: "UTC", label: "Coordinated Universal Time (UTC)" },
  { code: "Asia/Dubai", label: "Gulf Standard Time (GST - Asia/Dubai)" },
  { code: "Asia/Singapore", label: "Singapore Time (SGT - Asia/Singapore)" },
  { code: "Europe/London", label: "London Time (GMT/BST - Europe/London)" },
  { code: "America/New_York", label: "Eastern Time (ET - America/New_York)" },
  {
    code: "America/Los_Angeles",
    label: "Pacific Time (PT - America/Los_Angeles)",
  },
] as const;

export const SUPPORTED_DATE_FORMATS = [
  {
    code: "DD/MM/YYYY",
    label: "DD/MM/YYYY (e.g. 15/01/2026)",
    sample: "15/01/2026",
  },
  {
    code: "MM/DD/YYYY",
    label: "MM/DD/YYYY (e.g. 01/15/2026)",
    sample: "01/15/2026",
  },
  {
    code: "YYYY-MM-DD",
    label: "YYYY-MM-DD (e.g. 2026-01-15)",
    sample: "2026-01-15",
  },
  {
    code: "DD MMM YYYY",
    label: "DD MMM YYYY (e.g. 15 Jan 2026)",
    sample: "15 Jan 2026",
  },
  {
    code: "MMM DD, YYYY",
    label: "MMM DD, YYYY (e.g. Jan 15, 2026)",
    sample: "Jan 15, 2026",
  },
] as const;

export const SUPPORTED_TIME_FORMATS = [
  { code: "12h", label: "12-Hour (e.g. 02:30 PM)", sample: "02:30 PM" },
  { code: "24h", label: "24-Hour (e.g. 14:30)", sample: "14:30" },
] as const;

const MONTH_NAMES_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function formatCustomDate(
  dateInput: string | Date | number | null | undefined,
  dateFormat = "DD/MM/YYYY",
): string {
  if (!dateInput) return "";

  let year: number;
  let month: number;
  let day: number;

  if (typeof dateInput === "string") {
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
    if (isNaN(dateInput.getTime())) return "";
    year = dateInput.getFullYear();
    month = dateInput.getMonth() + 1;
    day = dateInput.getDate();
  } else if (typeof dateInput === "number") {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return "";
    year = d.getFullYear();
    month = d.getMonth() + 1;
    day = d.getDate();
  } else {
    return "";
  }

  const dayStr = String(day).padStart(2, "0");
  const monthStr = String(month).padStart(2, "0");
  const monthName = MONTH_NAMES_SHORT[month - 1] || monthStr;

  switch (dateFormat) {
    case "MM/DD/YYYY":
      return `${monthStr}/${dayStr}/${year}`;
    case "YYYY-MM-DD":
      return `${year}-${monthStr}-${dayStr}`;
    case "DD MMM YYYY":
      return `${dayStr} ${monthName} ${year}`;
    case "MMM DD, YYYY":
      return `${monthName} ${dayStr}, ${year}`;
    case "DD/MM/YYYY":
    default:
      return `${dayStr}/${monthStr}/${year}`;
  }
}

export function formatCustomDateTime(
  dateInput: string | Date | number | null | undefined,
  dateFormat = "DD/MM/YYYY",
  timeFormat = "12h",
): string {
  if (!dateInput) return "";
  const dateStr = formatCustomDate(dateInput, dateFormat);
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return dateStr;

  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, "0");

  if (timeFormat === "24h") {
    return `${dateStr} ${String(hours).padStart(2, "0")}:${minutes}`;
  }

  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${dateStr} ${String(hours).padStart(2, "0")}:${minutes} ${ampm}`;
}

export function formatCurrency(
  amount: number | string,
  currency = "INR",
  locale = "en-IN",
): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "0.00";

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    const symbol =
      SUPPORTED_CURRENCIES.find((c) => c.code === currency)?.symbol || currency;
    return `${symbol}${num.toFixed(2)}`;
  }
}

export function formatNumber(value: number, locale = "en-IN"): string {
  try {
    return new Intl.NumberFormat(locale).format(value);
  } catch {
    return value.toString();
  }
}
