import { describe, expect, it } from "vitest";
import { buildPendingCenter, requiredDocuments, scopePendingStudents, type PendingStudent, type PendingUser, type PendingPromotion } from "./pending-center";

const teacher: PendingUser = { id: "teacher", role: "catequista", is_coordenador: false, etapa: "Quarta Etapa A", paroquia_id: "parish" };
const coordinator = { ...teacher, role: "coordenador" as const };
const admin = { ...teacher, role: "admin" as const };
const student = (id: string, overrides: Partial<PendingStudent> = {}): PendingStudent => ({ id, name: id, class_name: "Quarta Etapa A", catequista_id: "teacher", paroquia_id: "parish", active: true, paroquias: { nome: "Paróquia" }, ...overrides });
const promotion = (id: string, overrides: Partial<PendingPromotion> = {}): PendingPromotion => ({ id, student_id: "a", ano_catequetico: 2025, decisao: null, destino_class_name: "Quinta Etapa", score_faltas: 5, faltas_nao_justificadas: 4, meses_sem_missa: 1, ...overrides });
const input = () => ({ user: coordinator, scope: { kind: "all" as const }, date: "2026-10-12", students: [student("a"), student("b")], attendance: [], documents: [], justifications: [], promotions: [] });

describe("pending center derivation", () => {
  it("intersects every requested scope with authority and excludes inactive students", () => {
    const students = [student("assigned-other-parish", { paroquia_id: "other" }), student("fallback", { catequista_id: null }), student("other-owner", { catequista_id: "other" }), student("other-class", { catequista_id: null, class_name: "Crisma" }), student("other-parish", { catequista_id: null, paroquia_id: "other" }), student("inactive", { active: false })];
    expect(scopePendingStudents(students, teacher, { kind: "all" }).map((s) => s.id)).toEqual(["assigned-other-parish", "fallback"]);
    expect(scopePendingStudents(students, teacher, { kind: "paroquia", paroquia_id: "other" }).map((s) => s.id)).toEqual(["assigned-other-parish"]);
    expect(scopePendingStudents(students, coordinator, { kind: "all" }).map((s) => s.id)).toEqual(["fallback", "other-class", "other-owner"]);
    expect(scopePendingStudents(students, coordinator, { kind: "paroquia", paroquia_id: "other" })).toEqual([]);
    expect(scopePendingStudents(students, admin, { kind: "etapa", etapa: "Crisma", paroquia_id: "parish" }).map((s) => s.id)).toEqual(["other-class"]);
  });

  it("keeps coordinator own scope narrow and null-parish fallback local", () => {
    const students = [student("own"), student("others", { catequista_id: "other" }), student("null", { paroquia_id: null, catequista_id: null })];
    expect(scopePendingStudents(students, coordinator, { kind: "own" }).map((s) => s.id)).toEqual(["own"]);
    expect(scopePendingStudents(students, { ...teacher, paroquia_id: null }, { kind: "all" }).map((s) => s.id)).toEqual(["null", "own"]);
  });

  it("counts unique roster and student/date attendance separately per parish/class", () => {
    const result = buildPendingCenter({ ...input(), user: admin, students: [student("a"), student("a"), student("b"), student("c", { class_name: "Quarta Etapa B" }), student("d", { paroquia_id: "other", paroquias: { nome: "Outra" } })], attendance: [{ student_id: "a", date: "2026-10-12" }, { student_id: "a", date: "2026-10-12" }, { student_id: "b", date: "2026-10-11" }] });
    expect(result.studentsCount).toBe(4);
    expect(result.attendanceGroups).toHaveLength(3);
    expect(result.attendanceGroups.find((g) => g.class_name === "Quarta Etapa A" && g.paroquia_id === "parish")).toMatchObject({ total: 2, recorded: 1, missing: 1, status: "partial" });
    expect(result.attendanceGroups.find((g) => g.class_name === "Quarta Etapa B")).toMatchObject({ recorded: 0, missing: 1, status: "unstarted" });
    expect(buildPendingCenter({ ...input(), attendance: [{ student_id: "a", date: "2026-10-12" }, { student_id: "b", date: "2026-10-12" }] }).attendanceGroups).toEqual([]);
  });

  it("matches current fourth-stage and Crisma document requirements only", () => {
    expect(requiredDocuments("Quarta Etapa B")).toEqual(["batismo", "endereco"]);
    expect(requiredDocuments("4ª Etapa")).toEqual(["batismo", "endereco"]);
    expect(requiredDocuments("Quinta Etapa")).toEqual([]);
    expect(requiredDocuments("Crisma A")).toHaveLength(4);
    const result = buildPendingCenter({ ...input(), students: [student("a"), student("b", { class_name: "Crisma A" }), student("c", { class_name: "Primeira Etapa" })], documents: [{ student_id: "a", batismo: true, endereco: true, crisma_padrinho: false, primeira_comunhao: false }, { student_id: "b", batismo: true, endereco: false, crisma_padrinho: false, primeira_comunhao: true }] });
    expect(result.documents).toEqual([expect.objectContaining({ student_id: "b", missing: ["endereco", "crisma_padrinho"] })]);
    expect(buildPendingCenter(input()).documents[0].missing).toEqual(["batismo", "endereco"]);
  });

  it("keeps pending justifications across dates in authorized active roster, deduplicated and ordered", () => {
    const p = { id: "p", student_id: "a", date: "2025-01-01", reason: "Consulta" };
    const result = buildPendingCenter({ ...input(), justifications: [p, p, { ...p, id: "outside", student_id: "outside" }, { ...p, id: "later", student_id: "b", date: "2026-10-20" }] });
    expect(result.justifications.map((p) => p.id)).toEqual(["p", "later"]);
    expect(result.justifications[0]).toMatchObject({ name: "a", reason: "Consulta", paroquia_nome: "Paróquia" });
  });

  it("shows all unresolved promotion years only to coordinator/admin and only for active scope", () => {
    const promotions = [promotion("past"), promotion("past"), promotion("current", { ano_catequetico: 2026 }), promotion("done", { decisao: "promovido" }), promotion("outside", { student_id: "outside" })];
    expect(buildPendingCenter({ ...input(), promotions }).promotions.map((p) => p.id)).toEqual(["current", "past"]);
    expect(buildPendingCenter({ ...input(), user: teacher, promotions }).promotions).toEqual([]);
    expect(buildPendingCenter({ ...input(), user: { ...teacher, is_coordenador: true }, promotions }).promotions).toHaveLength(2);
  });
});
