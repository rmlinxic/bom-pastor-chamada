import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { localDateString } from "@/lib/dates";
const mocks = vi.hoisted(() => ({
  records: [] as { student_id: string; status: string; justification_reason: string | null }[],
  pending: [] as { student_id: string; date: string; reason: string }[],
  mutate: vi.fn(),
}));
vi.mock("@/hooks/useStudents", () => ({ useStudents: () => ({ data: [{ id: "student", name: "Ana", class_name: "Primeira Etapa" }] }) }));
vi.mock("@/hooks/useAttendance", () => ({
  useAttendanceByDate: () => ({ data: mocks.records }),
  usePendingJustifications: () => ({ data: mocks.pending }),
  useSaveAttendance: () => ({ mutate: mocks.mutate, isPending: false }),
}));
import Attendance from "./Attendance";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.records = [];
  mocks.pending = [];
});

describe("attendance justification display", () => {
  it("shows the saved reason beneath a justified student's name", () => {
    mocks.records = [{ student_id: "student", status: "falta_justificada", justification_reason: "Consulta médica" }];
    render(<Attendance />);
    const row = screen.getByRole("button", { name: /Ana Primeira Etapa/ });
    expect(within(row).getByText("Consulta médica", { exact: false })).toBeInTheDocument();
    expect(within(row).getByText("Justificada")).toBeInTheDocument();
    expect(row).toBeDisabled();
  });

  it("labels pending reasons while retaining the recorded absence status", () => {
    mocks.records = [{ student_id: "student", status: "falta_nao_justificada", justification_reason: null }];
    mocks.pending = [{ student_id: "student", date: localDateString(), reason: "Viagem com a família" }];
    render(<Attendance />);
    const row = screen.getByRole("button", { name: /Ana Primeira Etapa/ });
    expect(within(row).getByText("Justificativa enviada (pendente):")).toBeInTheDocument();
    expect(within(row).getByText("Falta")).toBeInTheDocument();
    expect(within(row).queryByText("Justificada")).not.toBeInTheDocument();
  });

  it("does not show pending reasons from a different date", () => {
    mocks.pending = [{ student_id: "student", date: "2000-01-01", reason: "Motivo antigo" }];
    render(<Attendance />);
    expect(screen.queryByText("Motivo antigo", { exact: false })).not.toBeInTheDocument();
  });

  it("keeps saved reasons visible while editing and saves the selected status", () => {
    mocks.records = [{ student_id: "student", status: "falta_justificada", justification_reason: "Consulta médica" }];
    render(<Attendance />);
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    const row = screen.getByRole("button", { name: /Ana Primeira Etapa/ });
    fireEvent.click(row);
    expect(within(row).getByText("Presente")).toBeInTheDocument();
    expect(within(row).getByText("Consulta médica", { exact: false })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Salvar Alterações" }));
    expect(mocks.mutate).toHaveBeenCalledWith([{ student_id: "student", date: localDateString(), status: "presente" }], expect.objectContaining({ onSuccess: expect.any(Function) }));
  });
});
