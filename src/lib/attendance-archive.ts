export interface AttendanceArchiveInput {
  year: number;
  paroquiaId: string | null;
  students: unknown[];
  catequistas: unknown[];
  attendance: unknown[];
  massAttendance: unknown[];
}

export function buildAttendanceArchive(input: AttendanceArchiveInput) {
  return {
    format: "bom-pastor-attendance-archive",
    version: 1,
    exportedAt: new Date().toISOString(),
    ...input,
  };
}

/** O arquivo inclui nomes/turmas da época para preservar o histórico após promoções. */
export function downloadAttendanceArchive(input: AttendanceArchiveInput): void {
  const blob = new Blob([JSON.stringify(buildAttendanceArchive(input), null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `arquivo-presencas-${input.year}-${input.paroquiaId ?? "todas"}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export interface ArchivedStudent {
  id: string;
  name: string;
  class_name: string;
  paroquia_id: string | null;
  paroquia_nome: string | null;
}

export interface ArchivedAttendance {
  id: string;
  student_id: string;
  date: string;
  status: string;
  justification_reason: string | null;
  created_at: string;
  updated_at: string;
  students: { name: string; class_name: string; paroquia_id: string | null } | null;
}

export interface ParsedAttendanceArchive {
  year: number;
  paroquiaId: string | null;
  students: ArchivedStudent[];
  catequistas: unknown[];
  attendance: ArchivedAttendance[];
  massAttendance: { id: string; student_id: string; date: string; students: { name: string; paroquia_id: string | null } | null }[];
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Arquivo anual inválido.");
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== "string") throw new Error("Arquivo anual inválido.");
  return value;
}

export function parseAttendanceArchive(content: string): ParsedAttendanceArchive {
  const data = record(JSON.parse(content));
  if (data.format !== "bom-pastor-attendance-archive" || data.version !== 1 || !Number.isInteger(data.year) || Number(data.year) < 1900 || Number(data.year) > 9999) throw new Error("Formato de arquivo anual não reconhecido.");
  if (![data.students, data.attendance, data.massAttendance, data.catequistas].every(Array.isArray)) throw new Error("Arquivo anual incompleto.");
  const students = (data.students as unknown[]).map((entry) => {
    const student = record(entry);
    const parish = student.paroquias ? record(student.paroquias) : null;
    return { id: text(student.id), name: text(student.name), class_name: text(student.class_name), paroquia_id: student.paroquia_id == null ? null : text(student.paroquia_id),
      paroquia_nome: typeof student.paroquia_nome === "string" ? student.paroquia_nome : typeof parish?.nome === "string" ? parish.nome : null };
  });
  const studentMap = new Map(students.map((student) => [student.id, student]));
  const parseRecord = (entry: unknown) => {
    const item = record(entry);
    const studentId = text(item.student_id);
    const date = text(item.date);
    const calendarDate = new Date(`${date}T12:00:00`);
    const realDate = Number.isFinite(calendarDate.getTime()) && `${calendarDate.getFullYear()}-${String(calendarDate.getMonth() + 1).padStart(2, "0")}-${String(calendarDate.getDate()).padStart(2, "0")}` === date;
    if (!studentMap.has(studentId) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !date.startsWith(`${data.year}-`) || !realDate) throw new Error("Registro fora do ano ou do cadastro do arquivo.");
    return { item, id: text(item.id), studentId, date, student: studentMap.get(studentId)! };
  };
  const attendance = (data.attendance as unknown[]).map((entry) => {
    const { item, id, studentId, date, student } = parseRecord(entry);
    const status = text(item.status);
    if (!["presente", "falta_justificada", "falta_nao_justificada"].includes(status)) throw new Error("Status de presença inválido.");
    return { id, student_id: studentId, date, status, justification_reason: item.justification_reason == null ? null : text(item.justification_reason),
      created_at: typeof item.created_at === "string" ? item.created_at : "", updated_at: typeof item.updated_at === "string" ? item.updated_at : "", students: student };
  });
  const massAttendance = (data.massAttendance as unknown[]).map((entry) => {
    const { id, studentId, date, student } = parseRecord(entry);
    return { id, student_id: studentId, date, students: student };
  });
  return { year: Number(data.year), paroquiaId: data.paroquiaId == null ? null : text(data.paroquiaId), students, catequistas: data.catequistas as unknown[], attendance, massAttendance };
}
