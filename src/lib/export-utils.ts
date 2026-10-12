export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

export function csvText(rows: (string | number)[][]): string {
  return rows.map((row) => row.map((value) => {
    const text = String(value);
    const safe = typeof value === "string" && /^[\s\uFEFF]*[=+@-]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  }).join(",")).join("\n");
}

export interface JustifiedRecord {
  student_id: string;
  date: string;
  justification_reason?: string | null;
}

export function worksheetName(label: string, used: string[]): string {
  const base = label.replace(/[:\\/?*[\]]/g, " ").replace(/^'+|'+$/g, "").trim() || "Relatório";
  let name = base.slice(0, 31);
  for (let suffix = 2; used.some((sheet) => sheet.toLowerCase() === name.toLowerCase()); suffix++) {
    const end = ` (${suffix})`;
    name = base.slice(0, 31 - end.length) + end;
  }
  return name;
}

export function justificationRows(records: JustifiedRecord[], students: Record<string, { name: string; class_name: string }>): string[][] {
  return records.filter((record) => record.justification_reason?.trim()).sort((a, b) => a.date.localeCompare(b.date)).map((record) => [
    record.date, students[record.student_id]?.name ?? "Catequizando", students[record.student_id]?.class_name ?? "", record.justification_reason!,
  ]);
}
