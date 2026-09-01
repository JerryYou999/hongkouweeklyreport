export function getIsoWeek(dateValue: string | Date) {
  const input = typeof dateValue === 'string' ? new Date(`${dateValue}T12:00:00Z`) : dateValue;
  if (Number.isNaN(input.getTime())) throw new Error('INVALID_REPORT_DATE');

  const date = new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const isoWeek = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { isoYear, isoWeek };
}
