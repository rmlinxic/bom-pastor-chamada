import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { localDateString } from "@/lib/dates";
import { MemoryRouter } from "react-router-dom";
const mocks = vi.hoisted(() => ({
  records: [] as { student_id: string; status: string; justification_reason: string | null }[],
  pending: [] as { student_id: string; date: string; reason: string }[],
  mutate: vi.fn(),
  students: [{ id: "student", name: "Ana", class_name: "Primeira Etapa", paroquia_id: "parish" }],
  studentsError: false,
}));
vi.mock("@/hooks/useStudents", () => ({ useStudents: () => ({ data: mocks.students, isError: mocks.studentsError }) }));
vi.mock("@/hooks/useAttendance", () => ({
  useAttendanceByDate: () => ({ data: mocks.records }),
  usePendingJustifications: () => ({ data: mocks.pending }),
  useSaveAttendance: () => ({ mutate: mocks.mutate, isPending: false }),
}));
import Attendance from "./Attendance";
function renderAttendance(route = "/chamada") { return render(<MemoryRouter initialEntries={[route]}><Attendance /></MemoryRouter>); }

beforeEach(() => {
  vi.clearAllMocks();
  mocks.records = [];
  mocks.pending = [];
  mocks.students = [{ id: "student", name: "Ana", class_name: "Primeira Etapa", paroquia_id: "parish" }];
  mocks.studentsError = false;
});

describe("attendance justification display", () => {
  it("shows the saved reason beneath a justified student's name", () => {
    mocks.records = [{ student_id: "student", status: "falta_justificada", justification_reason: "Consulta médica" }];
    renderAttendance();
    const row = screen.getByRole("button", { name: /Ana Primeira Etapa/ });
    expect(within(row).getByText("Consulta médica", { exact: false })).toBeInTheDocument();
    expect(within(row).getByText("Justificada")).toBeInTheDocument();
    expect(row).toBeDisabled();
  });

  it("labels pending reasons while retaining the recorded absence status", () => {
    mocks.records = [{ student_id: "student", status: "falta_nao_justificada", justification_reason: null }];
    mocks.pending = [{ student_id: "student", date: localDateString(), reason: "Viagem com a família" }];
    renderAttendance();
    const row = screen.getByRole("button", { name: /Ana Primeira Etapa/ });
    expect(within(row).getByText("Justificativa enviada (pendente):")).toBeInTheDocument();
    expect(within(row).getByText("Falta")).toBeInTheDocument();
    expect(within(row).queryByText("Justificada")).not.toBeInTheDocument();
  });

  it("does not show pending reasons from a different date", () => {
    mocks.pending = [{ student_id: "student", date: "2000-01-01", reason: "Motivo antigo" }];
    renderAttendance();
    expect(screen.queryByText("Motivo antigo", { exact: false })).not.toBeInTheDocument();
  });

  it("keeps saved reasons visible while editing and saves the selected status", () => {
    mocks.records = [{ student_id: "student", status: "falta_justificada", justification_reason: "Consulta médica" }];
    renderAttendance();
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    const row = screen.getByRole("button", { name: /Ana Primeira Etapa/ });
    fireEvent.click(row);
    expect(within(row).getByText("Presente")).toBeInTheDocument();
    expect(within(row).getByText("Consulta médica", { exact: false })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Salvar Alterações" }));
    expect(mocks.mutate).toHaveBeenCalledWith([{ student_id: "student", date: localDateString(), status: "presente" }], expect.objectContaining({ onSuccess: expect.any(Function) }));
  });

  it("opens the selected date and saves only the linked class and parish", () => {
    mocks.students.push({ id: "other-class", name: "Bruno", class_name: "Segunda Etapa", paroquia_id: "parish" }, { id: "other-parish", name: "Carla", class_name: "Primeira Etapa", paroquia_id: "other" });
    renderAttendance("/chamada?date=2026-10-01&turma=Primeira+Etapa&paroquia=parish&student=student");
    expect(screen.queryByRole("button", { name: /Bruno/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Carla/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Salvar Chamada" }));
    expect(mocks.mutate).toHaveBeenCalledWith([{ student_id: "student", date: "2026-10-01", status: "presente" }], expect.any(Object));
  });

  it("does not save when loading the roster failed", () => {
    mocks.studentsError = true;
    renderAttendance();
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar");
    expect(screen.getByRole("button", { name: "Salvar Chamada" })).toBeDisabled();
  });
});
