/** Datas de calendário usam o fuso local; UTC fica reservado para timestamps. */
export function localDateString(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Parse a real local calendar date without UTC shifts or date overflow. */
export function parseLocalDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1000) return null;
  const date = new Date(year, month - 1, day);
  return localDateString(date) === value ? date : null;
}

/** Catechesis and attendance calls are held on Saturdays. */
export function isCatechesisSaturday(date: string): boolean {
  return parseLocalDate(date)?.getDay() === 6;
}

/** Most recent catechesis date in the local calendar, including today when Saturday. */
export function latestCatechesisSaturday(now = new Date()): string {
  const date = new Date(now.getTime());
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 1) % 7));
  return localDateString(date);
}

export function localMonthString(date = new Date()): string {
  return localDateString(date).slice(0, 7);
}

export function shiftMonth(month: string, offset: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return localMonthString(new Date(year, monthNumber - 1 + offset, 1));
}

export function monthDateRange(month: string): { start: string; end: string } {
  const [year, monthNumber] = month.split("-").map(Number);
  return { start: `${month}-01`, end: localDateString(new Date(year, monthNumber, 0)) };
}
