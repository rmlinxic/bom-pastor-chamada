/** Datas de calendário usam o fuso local; UTC fica reservado para timestamps. */
export function localDateString(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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
