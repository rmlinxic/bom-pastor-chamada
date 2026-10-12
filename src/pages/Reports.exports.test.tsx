import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
const mocks = vi.hoisted(() => ({ writeFile: vi.fn(), from: vi.fn(), csvBlob: null as Blob | null }));
vi.mock("xlsx", async (original) => ({ ...await original<typeof import("xlsx")>(), writeFile: mocks.writeFile }));
const students = [
  { id: "one", name: "Ana", class_name: "Turma/A", paroquia_nome: "Paróquia", paroquia_id: "parish" },
  { id: "two", name: "Maria", class_name: "Turma:A", paroquia_nome: "Paróquia", paroquia_id: "parish" },
];
const reason = 'Consulta médica\n<img src=x onerror="alert(1)">';
vi.mock("@/hooks/useStudents", () => ({ useStudents: () => ({ data: students }) }));
vi.mock("@/hooks/useAttendance", () => ({
  useAllAttendance: () => ({ data: [
    { id: "a", student_id: "one", date: "2025-10-12", status: "falta_justificada", justification_reason: reason },
    { id: "b", student_id: "two", date: "2025-10-12", status: "presente", justification_reason: null },
    { id: "c", student_id: "one", date: "2026-10-12", status: "falta_justificada", justification_reason: "Motivo exclusivo de 2026" },
  ] }),
  usePendingJustifications: () => ({ data: [] }),
  useDeleteAttendance: () => ({ isPending: false, mutate: vi.fn() }),
  useDeletePendingJustification: () => ({ isPending: false, mutate: vi.fn() }),
  useUpdatePendingJustification: () => ({ isPending: false, mutate: vi.fn() }),
}));
vi.mock("@/hooks/useMassAttendance", () => ({ useMassAttendanceByMonth: () => ({ data: [] }), useDeleteMassAttendance: () => ({ isPending: false, mutate: vi.fn() }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { paroquia_id: "parish" }, isAdmin: true, isCoordinator: false, isCatequista: false }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
import Reports from "./Reports";

function selectYear() {
  render(<Reports />);
  fireEvent.change(screen.getByLabelText("Ano das presenças"), { target: { value: "2025" } });
}
function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsText(blob);
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.csvBlob = null;
  Object.defineProperty(URL, "createObjectURL", { configurable: true, writable: true, value: vi.fn((blob: Blob) => { mocks.csvBlob = blob; return "blob:test"; }) });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, writable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("actual Reports exports", () => {
  it("includes full justification text and only the selected year in CSV", async () => {
    selectYear();
    fireEvent.click(screen.getByRole("button", { name: "Baixar" }));
    fireEvent.click(screen.getByRole("button", { name: "CSV" }));
    const csv = await readBlob(mocks.csvBlob!);
    expect(csv).toContain('Consulta médica\n<img src=x onerror=""alert(1)"">');
    expect(csv).toContain("2025-10-12");
    expect(csv).not.toContain("2026-10-12");
    expect(csv).not.toContain("Motivo exclusivo de 2026");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("creates safe unique worksheet names and a full Justificativas appendix", () => {
    selectYear();
    fireEvent.click(screen.getByRole("button", { name: "Baixar" }));
    fireEvent.click(screen.getByRole("button", { name: "Excel (XLSX)" }));
    const [workbook, filename] = mocks.writeFile.mock.calls[0] as [XLSX.WorkBook, string];
    expect(filename).toContain("2025");
    expect(workbook.SheetNames).toContain("Justificativas");
    expect(new Set(workbook.SheetNames.map((name) => name.toLowerCase())).size).toBe(workbook.SheetNames.length);
    for (const name of workbook.SheetNames) { expect(name.length).toBeLessThanOrEqual(31); expect(name).not.toMatch(/[:\\/?*[\]]/); }
    const appendix = XLSX.utils.sheet_to_json(workbook.Sheets.Justificativas, { header: 1 });
    expect(appendix).toContainEqual(["2025-10-12", "Ana", "Turma/A", reason]);
    expect(JSON.stringify(appendix)).not.toContain("Motivo exclusivo de 2026");
    expect(() => XLSX.write(workbook, { type: "array", bookType: "xlsx" })).not.toThrow();
  });

  it("exports a loaded annual archive using its original class and reasons", async () => {
    render(<Reports />);
    const content = JSON.stringify({
      format: "bom-pastor-attendance-archive", version: 1, year: 2024, paroquiaId: "parish", catequistas: [],
      students: [{ id: "one", name: "Ana", class_name: "Primeira Etapa A", paroquia_id: "parish" }],
      attendance: [{ id: "old", student_id: "one", date: "2024-02-29", status: "falta_justificada", justification_reason: "Motivo completo do arquivo de 2024" }],
      massAttendance: [],
    });
    const file = new File([content], "arquivo-2024.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: async () => content });
    fireEvent.change(screen.getByLabelText("Arquivo anual de presenças"), { target: { files: [file] } });
    await screen.findByText("Arquivo de 2024 • consulta sem alterações");
    expect(screen.getByLabelText("Ano das presenças")).toHaveValue("2024");
    fireEvent.click(screen.getByRole("button", { name: "Baixar" }));
    fireEvent.click(screen.getByRole("button", { name: "Excel (XLSX)" }));
    const [workbook, filename] = mocks.writeFile.mock.calls[0] as [XLSX.WorkBook, string];
    expect(filename).toContain("2024");
    expect(XLSX.utils.sheet_to_json(workbook.Sheets.Justificativas, { header: 1 })).toContainEqual(["2024-02-29", "Ana", "Primeira Etapa A", "Motivo completo do arquivo de 2024"]);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("prints malicious reason text as escaped content and detaches the popup opener", () => {
    const write = vi.fn();
    const popup = { opener: window, document: { write, close: vi.fn() } };
    vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    selectYear();
    fireEvent.click(screen.getByRole("button", { name: "PDF" }));
    expect(popup.opener).toBeNull();
    const html = write.mock.calls[0][0] as string;
    expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    expect(html).not.toContain('<img src=x');
    const printed = new DOMParser().parseFromString(html, "text/html");
    expect(printed.querySelector(".justifications")?.textContent).toContain(reason);
    expect(html).not.toContain("Motivo exclusivo de 2026");
  });
});
