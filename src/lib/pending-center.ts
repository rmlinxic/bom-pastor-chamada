import type { CatequistaUser } from "@/contexts/AuthContext";
import type { Tables } from "@/integrations/supabase/types";
import { isCatechesisSaturday } from "@/lib/dates";

export type PendingScope = { kind: "own" } | { kind: "all" } | { kind: "paroquia"; paroquia_id: string } | { kind: "etapa"; etapa: string; paroquia_id?: string };
export type PendingUser = Pick<CatequistaUser, "id" | "role" | "is_coordenador" | "etapa" | "paroquia_id">;
export type PendingStudent = Pick<Tables<"students">, "id" | "name" | "class_name" | "catequista_id" | "paroquia_id" | "active"> & { paroquias?: { nome: string } | null };
export type DocumentKey = "batismo" | "endereco" | "crisma_padrinho" | "primeira_comunhao";
export const DOCUMENT_LABELS: Record<DocumentKey, string> = { batismo: "Comprovante de Batismo", endereco: "Comprovante de Endereço", crisma_padrinho: "Comprovante de Crisma do Padrinho", primeira_comunhao: "Comprovante de Primeira Comunhão" };
export type PendingDocuments = Pick<Tables<"documentos_catequizando">, "student_id" | DocumentKey>;
export type PendingAttendance = Pick<Tables<"attendance">, "student_id" | "date">;
export type PendingJustification = Pick<Tables<"pending_justifications">, "id" | "student_id" | "date" | "reason">;
export type PendingPromotion = Pick<Tables<"promocoes_pendentes">, "id" | "student_id" | "ano_catequetico" | "decisao" | "destino_class_name" | "score_faltas" | "faltas_nao_justificadas" | "meses_sem_missa">;
type StudentDetails = { student_id: string; name: string; class_name: string; paroquia_id: string | null; paroquia_nome: string | null };
export interface PendingCenterData {
  date: string;
  year: number;
  studentsCount: number;
  canReviewPromotions: boolean;
  attendanceGroups: { id: string; paroquia_id: string | null; paroquia_nome: string | null; class_name: string; total: number; recorded: number; missing: number; status: "unstarted" | "partial" }[];
  justifications: (PendingJustification & StudentDetails)[];
  documents: (StudentDetails & { missing: DocumentKey[] })[];
  promotions: (PendingPromotion & StudentDetails)[];
}

export function canReviewPromotions(user: PendingUser) {
  return user.role === "admin" || user.role === "coordenador" || user.is_coordenador;
}
function isOwn(student: PendingStudent, user: PendingUser) {
  return student.catequista_id === user.id || (student.catequista_id === null && student.class_name === user.etapa && student.paroquia_id === user.paroquia_id);
}
/** Intersect the requested Dashboard scope with the user's existing authority. */
export function scopePendingStudents(students: PendingStudent[], user: PendingUser, scope: PendingScope) {
  return [...new Map(students.filter((student) => {
    if (!student.active) return false;
    const authorized = user.role === "admin" || (canReviewPromotions(user) && user.paroquia_id ? student.paroquia_id === user.paroquia_id : isOwn(student, user));
    if (!authorized) return false;
    if (scope.kind === "own") return isOwn(student, user);
    if (scope.kind === "paroquia") return student.paroquia_id === scope.paroquia_id;
    if (scope.kind === "etapa") return student.class_name === scope.etapa && (!scope.paroquia_id || student.paroquia_id === scope.paroquia_id);
    return true;
  }).map((student) => [student.id, student])).values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR") || a.id.localeCompare(b.id));
}

/** Keep in sync with Students.requiresDocs and DocumentosModal's current checklist. */
export function requiredDocuments(className: string): DocumentKey[] {
  const name = className.toLowerCase();
  if (name.includes("crisma")) return ["batismo", "endereco", "crisma_padrinho", "primeira_comunhao"];
  if (name.includes("quarta") || name.includes("4")) return ["batismo", "endereco"];
  return [];
}

export function buildPendingCenter(input: { user: PendingUser; scope: PendingScope; date: string; students: PendingStudent[]; attendance: PendingAttendance[]; justifications: PendingJustification[]; documents: PendingDocuments[]; promotions: PendingPromotion[] }): PendingCenterData {
  const students = scopePendingStudents(input.students, input.user, input.scope);
  const byId = new Map(students.map((student) => [student.id, student]));
  const details = (student: PendingStudent): StudentDetails => ({ student_id: student.id, name: student.name, class_name: student.class_name, paroquia_id: student.paroquia_id, paroquia_nome: student.paroquias?.nome ?? null });
  const recorded = new Set(input.attendance.filter((record) => record.date === input.date).map((record) => record.student_id));
  const groups = new Map<string, PendingCenterData["attendanceGroups"][number]>();
  for (const student of isCatechesisSaturday(input.date) ? students : []) {
    const id = JSON.stringify([student.paroquia_id, student.class_name]);
    const group = groups.get(id) ?? { id, paroquia_id: student.paroquia_id, paroquia_nome: student.paroquias?.nome ?? null, class_name: student.class_name, total: 0, recorded: 0, missing: 0, status: "unstarted" };
    group.total++;
    if (recorded.has(student.id)) group.recorded++;
    group.missing = group.total - group.recorded;
    group.status = group.recorded ? "partial" : "unstarted";
    groups.set(id, group);
  }
  const docs = new Map(input.documents.map((record) => [record.student_id, record]));
  const year = Number(input.date.slice(0, 4));
  const allowedPromotions = canReviewPromotions(input.user);
  return {
    date: input.date, year, studentsCount: students.length, canReviewPromotions: allowedPromotions,
    attendanceGroups: [...groups.values()].filter((group) => group.missing > 0).sort((a, b) => (a.paroquia_nome ?? "").localeCompare(b.paroquia_nome ?? "", "pt-BR") || a.class_name.localeCompare(b.class_name, "pt-BR") || a.id.localeCompare(b.id)),
    justifications: [...new Map(input.justifications.map((item) => [item.id, item])).values()].filter((item) => byId.has(item.student_id)).map((item) => ({ ...item, ...details(byId.get(item.student_id)!) })).sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "pt-BR") || a.id.localeCompare(b.id)),
    documents: students.map((student) => ({ ...details(student), missing: requiredDocuments(student.class_name).filter((key) => !docs.get(student.id)?.[key]) })).filter((item) => item.missing.length > 0),
    promotions: allowedPromotions ? [...new Map(input.promotions.map((item) => [item.id, item])).values()].filter((item) => !item.decisao && byId.has(item.student_id)).map((item) => ({ ...item, ...details(byId.get(item.student_id)!) })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR") || a.id.localeCompare(b.id)) : [],
  };
}
