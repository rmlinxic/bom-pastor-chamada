import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  invoke: vi.fn(),
  studentData: null as { id: string }[] | null,
  invalidateQueries: vi.fn(),
  auth: { user: { id: "teacher", etapa: "Etapa 1", paroquia_id: "parish" as string | null }, isAdmin: false, isCoordinator: false },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from, rpc: mocks.rpc, functions: { invoke: mocks.invoke } } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => mocks.auth }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: unknown[] }) =>
    options.queryKey[0] === "students" && mocks.studentData !== null
      ? { data: mocks.studentData, isSuccess: true }
      : options,
  useMutation: (options: unknown) => options,
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));
import { useAttendanceByDate, useAllAttendance, useSaveAttendance, useSubmitJustification, usePendingJustifications, useRejectJustification } from "./useAttendance";
import { useDeleteStudent, useStudents } from "./useStudents";
import { useAllDocumentos, useDocumentosStudent } from "./useDocumentos";
import { useCreateCatequista, useUpdateCatequista, useDeactivateCatequista } from "./useCatequistas";
import { useParoquiaMassStudentIds } from "./useMassAttendance";

type MutationOptions = {
  mutationFn: (records: { student_id: string; date: string; status: string }[]) => Promise<number>;
  onSettled: () => void;
};
function response(data: unknown = null, error: unknown = null) {
  const query = {
    select: vi.fn(), eq: vi.fn(), in: vi.fn(), or: vi.fn(), order: vi.fn(),
    upsert: vi.fn(), update: vi.fn(), delete: vi.fn(), range: vi.fn(),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error }).then(resolve),
  };
  for (const fn of [query.select, query.eq, query.in, query.or, query.order, query.upsert, query.update, query.delete, query.range]) fn.mockReturnValue(query);
  mocks.from.mockReturnValueOnce(query);
  return query;
}
const absence = (student_id = "student", date = "2026-10-12") => ({ student_id, date, status: "falta_nao_justificada" });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockReset();
  mocks.rpc.mockReset();
  mocks.studentData = null;
  mocks.auth.user.paroquia_id = "parish";
  mocks.auth.isAdmin = false;
});
describe("data hook regressions", () => {
  it("limits the unassigned class fallback to the teacher's parish in student and attendance queries", async () => {
    const studentQuery = response([]);
    await (useStudents() as unknown as { queryFn: () => Promise<unknown> }).queryFn();
    const filter = "catequista_id.eq.teacher,and(catequista_id.is.null,class_name.eq.Etapa 1,paroquia_id.eq.parish)";
    expect(studentQuery.or).toHaveBeenCalledWith(filter);
    // The parish condition belongs only to the fallback branch; explicitly
    // assigned students remain visible even when their parish differs.
    expect(studentQuery.eq).not.toHaveBeenCalledWith("paroquia_id", "parish");
    response();
    const attendanceStudents = response([]);
    await (useAllAttendance() as unknown as { queryFn: () => Promise<unknown> }).queryFn();
    expect(attendanceStudents.or).toHaveBeenCalledWith(filter);
  });

  it("limits unassigned fallback to null parish when the teacher has no parish", async () => {
    mocks.auth.user.paroquia_id = null;
    const students = response([]);
    await (useStudents() as unknown as { queryFn: () => Promise<unknown> }).queryFn();
    expect(students.or).toHaveBeenCalledWith("catequista_id.eq.teacher,and(catequista_id.is.null,class_name.eq.Etapa 1,paroquia_id.is.null)");
    response();
    const attendanceStudents = response([]);
    await (useAllAttendance() as unknown as { queryFn: () => Promise<unknown> }).queryFn();
    expect(attendanceStudents.or).toHaveBeenCalledWith("catequista_id.eq.teacher,and(catequista_id.is.null,class_name.eq.Etapa 1,paroquia_id.is.null)");
  });

  it("fetches documents only for visible student IDs", async () => {
    mocks.studentData = [{ id: "same-parish-student" }];
    const documents = response([]);
    const query = useAllDocumentos() as unknown as { queryFn: () => Promise<unknown>; queryKey: unknown[] };
    await query.queryFn();
    expect(documents.in).toHaveBeenCalledWith("student_id", ["same-parish-student"]);
    expect(query.queryKey).toContain("parish");
  });

  it("avoids document requests for an out-of-scope student", async () => {
    mocks.studentData = [{ id: "same-parish-student" }];
    const query = useDocumentosStudent("different-parish-student") as unknown as { queryFn: () => Promise<unknown> };
    await expect(query.queryFn()).resolves.toBeNull();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("scopes date attendance and refreshes parent justifications every 30 seconds", async () => {
    const attendance = response([]);
    response([{ id: "visible" }]);
    const query = useAttendanceByDate("2026-10-12") as unknown as {
      queryFn: () => Promise<unknown>; queryKey: unknown[]; refetchInterval: number;
    };
    await query.queryFn();
    expect(attendance.in).toHaveBeenCalledWith("student_id", ["visible"]);
    expect(query.queryKey).toEqual(["attendance", "2026-10-12", "teacher", "Etapa 1", "parish", false, false]);
    expect(query.refetchInterval).toBe(30_000);
  });

  it("reports an atomic application failure without client queue mutation", async () => {
    const error = { message: "update failed" };
    mocks.rpc.mockResolvedValueOnce({ data: null, error });
    const mutation = useSaveAttendance() as unknown as MutationOptions;
    await expect(mutation.mutationFn([absence()])).rejects.toEqual(error);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("does not call the server for an empty roster", async () => {
    await expect((useSaveAttendance() as unknown as MutationOptions).mutationFn([])).resolves.toBe(0);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("sends the explicit present status to the server without mutating the queue directly", async () => {
    mocks.rpc.mockResolvedValue({ data: 0, error: null });
    await expect((useSaveAttendance() as unknown as MutationOptions).mutationFn([{ ...absence(), status: "presente" }])).resolves.toBe(0);
    expect(mocks.rpc).toHaveBeenCalledWith("save_catechesis_attendance", { records: [{ ...absence(), status: "presente", explicit_status: true }] });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("matches pending justifications by date for mixed-date batches", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: 2, error: null });
    await expect((useSaveAttendance() as unknown as MutationOptions).mutationFn([absence("one"), absence("two", "2026-10-13")])).resolves.toBe(2);
    expect(mocks.rpc).toHaveBeenCalledWith("save_catechesis_attendance", { records: [{ ...absence("one"), explicit_status: true }, { ...absence("two", "2026-10-13"), explicit_status: true }] });
  });

  it("bounds large atomic application batches", async () => {
    mocks.rpc.mockResolvedValue({ data: 0, error: null });
    const records = Array.from({ length: 201 }, (_, i) => absence(`student-${i}`));
    await expect((useSaveAttendance() as unknown as MutationOptions).mutationFn(records)).resolves.toBe(0);
    expect(mocks.rpc.mock.calls.map((call) => call[1].records.length)).toEqual([100, 100, 1]);
  });

  it("distinguishes inherited statuses from intentional staff changes", async () => {
    mocks.rpc.mockResolvedValue({ data: 0, error: null });
    const records = [{ ...absence("one"), status: "falta_justificada", explicit_status: false }, { ...absence("two"), explicit_status: true }];
    await (useSaveAttendance() as unknown as MutationOptions).mutationFn(records);
    expect(mocks.rpc).toHaveBeenCalledWith("save_catechesis_attendance", { records });
  });

  it("refreshes persisted attendance even when a later request fails", () => {
    (useSaveAttendance() as unknown as MutationOptions).onSettled();
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["student-history"] });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["attendance"] });
  });

  it("reads attendance beyond the 1000-row cap in deterministic date/id order", async () => {
    mocks.auth.isAdmin = true;
    const query = response();
    const firstPage = Array.from({ length: 1000 }, (_, index) => ({ id: `row-${index}`, date: "2026-10-12" }));
    query.range.mockReturnValueOnce(Promise.resolve({ data: firstPage, error: null }))
      .mockReturnValueOnce(Promise.resolve({ data: [{ id: "row-1000", date: "2026-10-11" }], error: null }));
    const result = await (useAllAttendance() as unknown as { queryFn: () => Promise<unknown[]> }).queryFn();
    expect(result).toHaveLength(1001);
    expect(query.range.mock.calls).toEqual([[0, 999], [1000, 1999]]);
    expect(query.order.mock.calls).toEqual([["date", { ascending: false }], ["id"]]);
  });

  it("propagates later-page attendance errors instead of returning truncated exports", async () => {
    mocks.auth.isAdmin = true;
    const query = response();
    const error = { message: "second page failed" };
    query.range.mockReturnValueOnce(Promise.resolve({ data: Array.from({ length: 1000 }, () => ({ id: "row" })), error: null }))
      .mockReturnValueOnce(Promise.resolve({ data: null, error }));
    await expect((useAllAttendance() as unknown as { queryFn: () => Promise<unknown> }).queryFn()).rejects.toEqual(error);
  });

  it("loads all visible student IDs before applying the attendance scope", async () => {
    const attendance = response([]);
    const students = response();
    students.range.mockReturnValueOnce(Promise.resolve({ data: Array.from({ length: 1000 }, (_, index) => ({ id: `student-${index}` })), error: null }))
      .mockReturnValueOnce(Promise.resolve({ data: [{ id: "student-1000" }], error: null }));
    await (useAllAttendance() as unknown as { queryFn: () => Promise<unknown> }).queryFn();
    expect(attendance.in.mock.calls[0][1]).toHaveLength(1001);
    expect(students.range.mock.calls).toEqual([[0, 999], [1000, 1999]]);
  });

  it("includes inactive students in history but keeps pending queries active-only", async () => {
    response();
    const historyStudents = response([]);
    await (useAllAttendance() as unknown as { queryFn: () => Promise<unknown> }).queryFn();
    expect(historyStudents.eq).not.toHaveBeenCalledWith("active", true);
    response();
    const pendingStudents = response([]);
    await (usePendingJustifications() as unknown as { queryFn: () => Promise<unknown> }).queryFn();
    expect(pendingStudents.eq).toHaveBeenCalledWith("active", true);
  });

  it("propagates visibility lookup errors", async () => {
    response(); // The attendance builder is created before the student lookup.
    const error = { message: "student lookup failed" };
    response(null, error);
    const query = useAllAttendance() as unknown as { queryFn: () => Promise<unknown> };
    await expect(query.queryFn()).rejects.toEqual(error);
  });

  it("propagates parish mass student lookup errors", async () => {
    const error = { message: "mass student lookup failed" };
    response(null, error);
    const query = useParoquiaMassStudentIds() as unknown as { queryFn: () => Promise<unknown> };
    await expect(query.queryFn()).rejects.toEqual(error);
  });

  it("includes student scope inputs in its cache identity", () => {
    const query = useStudents() as unknown as { queryKey: unknown[] };
    expect(query.queryKey).toEqual(["students", "teacher", false, "parish", "Etapa 1", false]);
  });

  it("refreshes mass IDs and report visibility when a student is deactivated", () => {
    const mutation = useDeleteStudent() as unknown as { onSuccess: () => void };
    mutation.onSuccess();
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["paroquia-mass-student-ids"] });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["attendance-all"] });
  });

  it("submits the selected public student without reading private student data", async () => {
    mocks.rpc.mockResolvedValue({ data: { success: true }, error: null });
    const input = { studentId: "student", className: "Primeira Etapa", paroquiaId: "parish", date: "2026-10-12", reason: "Consulta médica" };
    const mutation = useSubmitJustification() as unknown as { mutationFn: (payload: typeof input) => Promise<unknown> };
    await expect(mutation.mutationFn(input)).resolves.toEqual({ pending: true });
    expect(mocks.rpc).toHaveBeenCalledWith("submit_selected_public_justification", { student_id: "student", class_name: "Primeira Etapa", parish_id: "parish", absence_date: "2026-10-12", reason: "Consulta médica" });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("refuses a justification through the authenticated atomic RPC", async () => {
    mocks.rpc.mockResolvedValue({ data: { success: true }, error: null });
    const mutation = useRejectJustification() as unknown as { mutationFn: (input: { studentId: string; date: string }) => Promise<void>; onSettled: () => void };
    await mutation.mutationFn({ studentId: "student", date: "2026-10-10" });
    expect(mocks.rpc).toHaveBeenCalledWith("reject_public_justification", { student_id: "student", absence_date: "2026-10-10" });
    expect(mocks.from).not.toHaveBeenCalled();
    mutation.onSettled();
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["pending-center"] });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["attendance"] });
  });

  it("uses authenticated account-management for create, update and deactivation", async () => {
    mocks.invoke.mockResolvedValue({ data: { id: "account" }, error: null });
    const profile = { password: "a", name: " Maria ", username: "MARIA", email: "MARIA@example.com", etapa: "Primeira Etapa", role: "catequista", paroquia_id: "parish", is_coordenador: false };
    const create = useCreateCatequista() as unknown as { mutationFn: (input: typeof profile) => Promise<void> };
    await create.mutationFn(profile);
    expect(mocks.invoke).toHaveBeenCalledWith("account-management", { body: { action: "create", ...profile, name: "Maria", username: "maria", email: "maria@example.com" } });
    const update = useUpdateCatequista() as unknown as { mutationFn: (input: typeof profile & { id: string }) => Promise<void> };
    await update.mutationFn({ ...profile, id: "account" });
    expect(mocks.invoke).toHaveBeenCalledWith("account-management", { body: { action: "update", ...profile, id: "account", name: "Maria", username: "maria", email: "maria@example.com" } });
    await (useDeactivateCatequista() as unknown as { mutationFn: (id: string) => Promise<void> }).mutationFn("account");
    expect(mocks.invoke).toHaveBeenCalledWith("account-management", { body: { action: "deactivate", id: "account" } });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("requires a chosen password before creating an account", async () => {
    const mutation = useCreateCatequista() as unknown as { mutationFn: (input: object) => Promise<void> };
    await expect(mutation.mutationFn({ name: "Maria", username: "maria", email: "", role: "catequista" })).rejects.toThrow("Informe uma senha.");
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("refreshes date attendance and history after a justification", () => {
    const mutation = useSubmitJustification() as unknown as { onSuccess: (result: { pending: boolean }) => void };
    mutation.onSuccess({ pending: false });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["attendance"] });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["student-history"] });
  });
});
