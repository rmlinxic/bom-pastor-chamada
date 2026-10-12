import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PendingCenterData, PendingStudent, PendingUser } from "@/lib/pending-center";

const mocks = vi.hoisted(() => ({ from: vi.fn(), auth: { user: { id: "teacher", role: "catequista", is_coordenador: false, etapa: "Quarta Etapa A", paroquia_id: "parish" } as PendingUser | null, isAdmin: false, isCoordinator: false } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => mocks.auth }));
vi.mock("@tanstack/react-query", () => ({ useQuery: (options: unknown) => options }));
import { loadPendingCenter, usePendingCenter } from "./usePendingCenter";

function response(rows: unknown[] = [], error: unknown = null) {
  const query = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), or: vi.fn(), is: vi.fn(), order: vi.fn(), range: vi.fn() };
  for (const method of [query.select, query.eq, query.in, query.or, query.is, query.order]) method.mockReturnValue(query);
  query.range.mockResolvedValue({ data: rows, error });
  return query;
}
const student = (id: string, overrides: Partial<PendingStudent> = {}): PendingStudent => ({ id, name: id, active: true, class_name: "Quarta Etapa A", catequista_id: "teacher", paroquia_id: "parish", ...overrides });
type QueryOptions = { queryFn: () => Promise<PendingCenterData>; enabled: boolean; queryKey: unknown[]; refetchInterval: number };
beforeEach(() => { vi.clearAllMocks(); mocks.auth.user = { id: "teacher", role: "catequista", is_coordenador: false, etapa: "Quarta Etapa A", paroquia_id: "parish" }; mocks.auth.isAdmin = false; mocks.auth.isCoordinator = false; });

describe("pending center loading", () => {
  it("uses active authorized IDs and no contacts; date applies only to calls", async () => {
    const students = response([student("a"), student("inactive", { active: false }), student("foreign", { catequista_id: "foreign", paroquia_id: "foreign" })]);
    const attendance = response([]), documents = response([]), pending = response([]);
    const tables = { students, attendance, documentos_catequizando: documents, pending_justifications: pending };
    mocks.from.mockImplementation((table: keyof typeof tables) => tables[table]);
    const result = await loadPendingCenter(mocks.auth.user!, "2026-10-12", { kind: "all" });
    expect(result.studentsCount).toBe(1);
    expect(students.eq).toHaveBeenCalledWith("active", true);
    expect(students.or).toHaveBeenCalledWith('catequista_id.eq."teacher",and(catequista_id.is.null,class_name.eq."Quarta Etapa A",paroquia_id.eq."parish")');
    for (const query of [attendance, documents, pending]) expect(query.in).toHaveBeenCalledWith("student_id", ["a"]);
    expect(attendance.eq).toHaveBeenCalledWith("date", "2026-10-12");
    expect(pending.eq).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalledWith("promocoes_pendentes");
    expect(students.select).toHaveBeenCalledWith("id,name,class_name,catequista_id,paroquia_id,active,paroquias(nome)");
  });

  it("loads all student pages, uses bounded ID chunks, and exhausts dependent pages", async () => {
    mocks.auth.user!.role = "admin";
    const students = response();
    students.range.mockResolvedValueOnce({ data: Array.from({ length: 1000 }, (_, i) => student(`student-${i}`)), error: null }).mockResolvedValueOnce({ data: [student("student-1000")], error: null });
    const attendanceQueries: ReturnType<typeof response>[] = [];
    const documentQueries: ReturnType<typeof response>[] = [];
    mocks.from.mockImplementation((table: string) => {
      if (table === "students") return students;
      const query = response();
      if (table === "attendance") attendanceQueries.push(query);
      if (table === "documentos_catequizando") {
        if (!documentQueries.length) query.range.mockResolvedValueOnce({ data: Array.from({ length: 1000 }, () => ({ student_id: "student-0", batismo: true, endereco: true })), error: null }).mockResolvedValueOnce({ data: [{ student_id: "student-1", batismo: true, endereco: true }], error: null });
        documentQueries.push(query);
      }
      return query;
    });
    const result = await loadPendingCenter(mocks.auth.user!, "2026-10-12", { kind: "all" });
    expect(result.studentsCount).toBe(1001);
    expect(students.range.mock.calls).toEqual([[0, 999], [1000, 1999]]);
    expect(documentQueries.flatMap((query) => query.range.mock.calls)).toContainEqual([1000, 1999]);
    expect(attendanceQueries).toHaveLength(11);
    expect(attendanceQueries.flatMap((query) => query.in.mock.calls[0][1])).toHaveLength(1001);
    for (const query of attendanceQueries) expect(query.in.mock.calls[0][1].length).toBeLessThanOrEqual(100);
  });

  it("propagates student and later dependent page failures", async () => {
    const error = { message: "failed page" };
    mocks.from.mockReturnValue(response([], error));
    await expect(loadPendingCenter(mocks.auth.user!, "2026-10-12", { kind: "own" })).rejects.toEqual(error);
    const students = response([student("a")]), pending = response();
    pending.range.mockResolvedValueOnce({ data: Array.from({ length: 1000 }, (_, i) => ({ id: `${i}`, student_id: "a", date: "2026-10-12", reason: "Consulta" })), error: null }).mockResolvedValueOnce({ data: null, error });
    mocks.from.mockImplementation((table: string) => table === "students" ? students : table === "pending_justifications" ? pending : response());
    await expect(loadPendingCenter(mocks.auth.user!, "2026-10-12", { kind: "own" })).rejects.toEqual(error);
  });

  it("does not request related tables for an empty scope", async () => {
    mocks.from.mockReturnValue(response());
    expect((await loadPendingCenter(mocks.auth.user!, "2026-10-12", { kind: "own" })).studentsCount).toBe(0);
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });

  it("queries unresolved promotions without a selected-date year filter and preserves parish authority", async () => {
    mocks.auth.user!.role = "coordenador";
    const students = response([student("a")]), promotions = response();
    mocks.from.mockImplementation((table: string) => table === "students" ? students : table === "promocoes_pendentes" ? promotions : response());
    await loadPendingCenter(mocks.auth.user!, "2026-10-12", { kind: "etapa", etapa: "Quarta Etapa A", paroquia_id: "parish" });
    expect(students.eq).toHaveBeenCalledWith("paroquia_id", "parish");
    expect(students.eq).toHaveBeenCalledWith("class_name", "Quarta Etapa A");
    expect(promotions.is).toHaveBeenCalledWith("decisao", null);
    expect(promotions.eq).not.toHaveBeenCalledWith("ano_catequetico", expect.anything());
  });

  it("rejects impossible dates before requesting data", async () => {
    for (const date of ["2026-02-31", "invalid", "2026-13-01"]) await expect(loadPendingCenter(mocks.auth.user!, date, { kind: "own" })).rejects.toThrow("Selecione uma data válida.");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("isolates cache by identity, role, authority, scope, date and refreshes every 30 seconds", () => {
    const query = usePendingCenter("2026-10-12", { kind: "own" }) as unknown as QueryOptions;
    expect(query.queryKey).toEqual(["pending-center", "teacher", "catequista", false, "parish", "Quarta Etapa A", false, false, { kind: "own" }, "2026-10-12"]);
    expect(query.refetchInterval).toBe(30_000);
    expect(query.enabled).toBe(true);
    mocks.auth.user = null;
    expect((usePendingCenter("2026-10-12", { kind: "own" }) as unknown as QueryOptions).enabled).toBe(false);
  });
});
