import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import AnoLetivo from "./AnoLetivo";

const mocks = vi.hoisted(() => ({ from: vi.fn(), navigate: vi.fn(), toast: vi.fn(), write: vi.fn(), archive: vi.fn(), events: [] as string[] }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "coordinator", paroquia_id: "parish" } }) }));
vi.mock("react-router-dom", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("@/lib/attendance-archive", () => ({ downloadAttendanceArchive: mocks.archive }));
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (value: string) => void; children: React.ReactNode }) => <select value={value} onChange={(event) => onValueChange(event.target.value)}>{children}</select>,
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => <option value={value}>{children}</option>,
}));

const teachers = [{ id: "ana", name: "Ana", etapa: "Primeira Etapa A" }, { id: "bruno", name: "Bruno", etapa: "Segunda Etapa A" }];
const students = [{ id: "student", name: "Aluno", class_name: "Primeira Etapa A", catequista_id: "ana", active: true }, { id: "inactive", name: "Antigo", class_name: "Primeira Etapa A", catequista_id: "ana", active: false }];
const year = new Date().getFullYear();

function setup({ loadingError = false, closed = false, archiveError = false, studentsError = false, largeArchive = false } = {}) {
  let studentReads = 0;
  const fixtureStudents = largeArchive ? [...students, ...Array.from({ length: 999 }, (_, index) => ({ ...students[1], id: `inactive-${index}` }))] : students;
  const archiveRecords = largeArchive ? Array.from({ length: 1001 }, (_, index) => ({ id: `record-${index}`, student_id: "inactive", date: `${year}-01-10`, status: "presente" })) : null;
  mocks.archive.mockImplementation(() => {
    mocks.events.push("archive");
    if (archiveError) throw new Error("download failed");
  });
  mocks.from.mockImplementation((table: string) => {
    const readNumber = table === "students" ? ++studentReads : 0;
    let writing = false;
    let lower = "";
    let upper = "9999";
    let rangeFrom = 0;
    let rangeTo = 999;
    let filterIds: string[] | undefined;
    const records = [
      { student_id: "inactive", date: `${year}-01-10`, status: "presente" },
      { student_id: "student", date: `${year - 1}-01-10`, status: "falta_nao_justificada" },
    ];
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn((_column: string, ids: string[]) => { filterIds = ids; return query; }),
      order: vi.fn().mockReturnThis(),
      range: vi.fn((from: number, to: number) => { rangeFrom = from; rangeTo = to; return query; }),
      maybeSingle: vi.fn().mockReturnThis(),
      gte: vi.fn((_column: string, value: string) => { lower = value; return query; }),
      lte: vi.fn((_column: string, value: string) => { upper = value; return query; }),
      update: (payload: unknown) => { writing = true; mocks.events.push(table); mocks.write(table, payload); return query; },
      insert: (payload: unknown) => { writing = true; mocks.events.push(table); mocks.write(table, payload); return query; },
      upsert: (payload: unknown) => { writing = true; mocks.events.push(table); mocks.write(table, payload); return query; },
      then: (resolve: (value: unknown) => unknown) => {
        const result = writing ? { data: null, error: null }
          : table === "catequistas" ? { data: teachers, error: loadingError ? new Error("unavailable") : null }
          : table === "students" ? { data: fixtureStudents.slice(rangeFrom, rangeTo + 1), error: studentsError && readNumber > 1 ? new Error("students unavailable") : null }
          : table === "anos_catequeticos" ? { data: closed ? { encerrado_em: `${year}-01-01` } : null, error: null }
          : { data: (archiveRecords ?? (table === "attendance" ? records : []))
            .filter((record) => record.date >= lower && record.date <= upper && (!filterIds || filterIds.includes(record.student_id)))
            .slice(rangeFrom, rangeTo + 1), error: null };
        return Promise.resolve(result).then(resolve);
      },
    };
    return query;
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><AnoLetivo /></QueryClientProvider>);
  fireEvent.change(screen.getByPlaceholderText("CONFIRMAR"), { target: { value: "CONFIRMAR" } });
  fireEvent.click(screen.getByRole("button", { name: /Prosseguir/ }));
}
async function closeYear() {
  await waitFor(() => expect(screen.getByRole("button", { name: /Revisar/ })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: /Revisar/ }));
  fireEvent.click(screen.getByRole("button", { name: "Baixar arquivo e Encerrar Ano" }));
}
afterEach(() => { cleanup(); vi.clearAllMocks(); mocks.events.length = 0; });

describe("academic year transition", () => {
  it("keeps current teacher suggestions and promotes students to the chosen destination teacher after archiving", async () => {
    setup();
    await closeYear();
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("/coordenador"));
    expect(mocks.events[0]).toBe("archive");
    expect(mocks.archive).toHaveBeenCalledWith(expect.objectContaining({ year, students, catequistas: teachers, attendance: [{ student_id: "inactive", date: `${year}-01-10`, status: "presente" }] }));
    expect(mocks.write).toHaveBeenCalledWith("students", { class_name: "Segunda Etapa A", catequista_id: "bruno", ano_catequetico: year + 1 });
    expect(mocks.write).toHaveBeenCalledWith("catequistas", { etapa: "Primeira Etapa A" });
    expect(mocks.write).toHaveBeenCalledWith("catequistas", { etapa: "Segunda Etapa A" });
    expect(mocks.from).not.toHaveBeenCalledWith("promocoes_pendentes");
  });
  it("archives every student and attendance/mass row beyond the 1000-row response cap", async () => {
    setup({ largeArchive: true });
    await closeYear();
    await waitFor(() => expect(mocks.archive).toHaveBeenCalled());
    const archive = mocks.archive.mock.calls[0][0];
    expect(archive.students).toHaveLength(1001);
    expect(archive.students.some((student: { id: string }) => student.id === "inactive-998")).toBe(true);
    expect(archive.attendance).toHaveLength(1001);
    expect(archive.massAttendance).toHaveLength(1001);
    expect(archive.attendance.some((record: { id: string }) => record.id === "record-1000")).toBe(true);
    expect(archive.massAttendance.some((record: { id: string }) => record.id === "record-1000")).toBe(true);
    expect(mocks.events[0]).toBe("archive");
  });
  it("accepts a different destination teacher and blocks duplicate or missing assignments", async () => {
    setup();
    await waitFor(() => expect(screen.getByRole("button", { name: /Revisar/ })).toBeEnabled());
    const menus = screen.getAllByRole("combobox") as HTMLSelectElement[];
    const first = menus.find((menu) => menu.value === "ana")!;
    const second = menus.find((menu) => menu.value === "bruno")!;
    fireEvent.change(second, { target: { value: "ana" } });
    expect(screen.getByRole("button", { name: /Revisar/ })).toBeDisabled();
    fireEvent.change(first, { target: { value: "__none__" } });
    expect(screen.getByRole("button", { name: /Revisar/ })).toBeEnabled();
    fireEvent.change(second, { target: { value: "__none__" } });
    expect(screen.getByRole("button", { name: /Revisar/ })).toBeDisabled();
    fireEvent.change(second, { target: { value: "ana" } });
    await closeYear();
    await waitFor(() => expect(mocks.write).toHaveBeenCalledWith("students", expect.objectContaining({ catequista_id: "ana" })));
  });
  it("does not write if the archive download fails", async () => {
    setup({ archiveError: true });
    await closeYear();
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
    expect(mocks.archive).toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
  it("does not write if the fresh student snapshot fails", async () => {
    setup({ studentsError: true });
    await closeYear();
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
    expect(mocks.archive).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("does not repeat a closed year", async () => {
    setup({ closed: true });
    await closeYear();
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ description: "Este ano catequético já foi encerrado." })));
    expect(mocks.archive).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("blocks planning if teachers cannot load", async () => {
    setup({ loadingError: true });
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: /Revisar/ })).toBeDisabled();
    expect(mocks.write).not.toHaveBeenCalled();
  });
});
