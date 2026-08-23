type DateInput = string | number | Date | null | undefined;

const padDatePart = (value: number | string): string => String(value).padStart(2, '0');

export function formatDate(dateInput: DateInput): string {
  if (!dateInput) return '';

  if (typeof dateInput === 'string') {
    // Match ISO date format YYYY-MM-DD (extract the date part before any time)
    const isoDateMatch = dateInput.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoDateMatch) {
      const [, year, month, day] = isoDateMatch;
      // Return directly from string to avoid any timezone conversion
      // The database stores dates as YYYY-MM-DD which represents midnight UTC
      return `${day}/${month}/${year}`;
    }

    const dayFirstMatch = dateInput.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (dayFirstMatch) {
      const [, day, month, year] = dayFirstMatch;
      return `${padDatePart(day)}/${padDatePart(month)}/${year}`;
    }
  }

  // For Date objects or timestamps
  // Force parse the date as if it's a UTC date to avoid timezone issues
  if (dateInput instanceof Date) {
    const year = dateInput.getUTCFullYear();
    const month = dateInput.getUTCMonth() + 1;
    const day = dateInput.getUTCDate();
    return `${padDatePart(day)}/${padDatePart(month)}/${year}`;
  }

  // If it's a number (timestamp in ms), create a Date and use UTC
  if (typeof dateInput === 'number') {
    const date = new Date(dateInput);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    return `${padDatePart(day)}/${padDatePart(month)}/${year}`;
  }

  return '';
}

export function parseDisplayDateToIso(dateInput: string): string | null {
  const match = dateInput.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;

  const [, dayValue, monthValue, yearValue] = match;
  const day = Number(dayValue);
  const month = Number(monthValue);
  const year = Number(yearValue);
  const date = new Date(year, month - 1, day);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return `${yearValue}-${padDatePart(month)}-${padDatePart(day)}`;
}
