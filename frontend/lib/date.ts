type DateInput = string | number | Date | null | undefined;

const padDatePart = (value: number | string): string => String(value).padStart(2, '0');

export function formatDate(dateInput: DateInput): string {
  if (!dateInput) return '';

  if (typeof dateInput === 'string') {
    const isoDateMatch = dateInput.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoDateMatch) {
      const [, year, month, day] = isoDateMatch;
      return `${day}/${month}/${year}`;
    }

    const dayFirstMatch = dateInput.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (dayFirstMatch) {
      const [, day, month, year] = dayFirstMatch;
      return `${padDatePart(day)}/${padDatePart(month)}/${year}`;
    }
  }

  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return '';

  return `${padDatePart(date.getDate())}/${padDatePart(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function parseDisplayDateToIso(dateInput: string): string | null {
  const match = dateInput.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;

  const [, dayValue, monthValue, yearValue] = match;
  const day = Number(dayValue);
  const month = Number(monthValue);
  const year = Number(yearValue);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return `${yearValue}-${padDatePart(month)}-${padDatePart(day)}`;
}
