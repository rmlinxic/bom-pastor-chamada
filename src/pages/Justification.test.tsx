import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  selectedParish: "",
  selectedStage: "",
  classesError: false,
  studentsError: false,
  students: [
    { id: "student-1", name: "Ana Silva", class_name: "Primeira Etapa B" },
    { id: "student-2", name: "Ana Silva", class_name: "Primeira Etapa B" },
  ],
}));

vi.mock("@/hooks/useAttendance", () => ({ useSubmitJustification: () => ({ mutate: mocks.mutate, isPending: false }) }));
vi.mock("@/hooks/useParoquias", () => ({ useParoquias: () => ({ data: [{ id: "parish-1", nome: "Comunidade Central", ativa: true }, { id: "parish-2", nome: "Comunidade São José", ativa: true }], isLoading: false, isError: false, refetch: vi.fn() }) }));
vi.mock("@/hooks/usePublicJustificationSelection", () => ({
  publicJustificationStages: () => ["Primeira Etapa"],
  publicJustificationStudentsForStage: (students: typeof mocks.students) => students,
  publicJustificationClassSuffix: (className: string) => className.endsWith(" B") ? "B" : "",
  usePublicJustificationClasses: (parishId: string) => {
    mocks.selectedParish = parishId;
    return { data: parishId ? [{ class_name: "Primeira Etapa B" }] : undefined, isLoading: false, isError: mocks.classesError, refetch: vi.fn() };
  },
  usePublicJustificationStudents: (parishId: string, stage: string) => {
    mocks.selectedParish = parishId;
    mocks.selectedStage = stage;
    return { data: parishId && stage ? mocks.students : undefined, isLoading: false, isError: mocks.studentsError, refetch: vi.fn() };
  },
}));

import Justification from "./Justification";

function choose(label: string, option: string) {
  fireEvent.keyDown(screen.getByRole("combobox", { name: label }), { key: "ArrowDown" });
  fireEvent.click(screen.getAllByRole("option", { name: option })[0]);
}

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", { configurable: true, value: () => false });
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { configurable: true, value: () => undefined });
  Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", { configurable: true, value: () => undefined });
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 9, 12, 14));
  vi.clearAllMocks();
  mocks.selectedParish = "";
  mocks.selectedStage = "";
  mocks.classesError = false;
  mocks.studentsError = false;
});
afterEach(() => vi.useRealTimers());

describe("public justification form", () => {
  it("selects a student by public name, submits the server class, and needs no phone", async () => {
    render(<Justification />);
    expect(screen.queryByLabelText(/telefone/i)).not.toBeInTheDocument();
    choose("Comunidade / Paróquia", "Comunidade Central");
    choose("Etapa do catequizando", "Primeira Etapa");
    choose("Nome do catequizando", "Ana Silva Turma B");
    fireEvent.change(screen.getByLabelText("Data da falta"), { target: { value: "2026-10-10" } });
    fireEvent.change(screen.getByLabelText("Motivo da falta"), { target: { value: "Consulta médica" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar justificativa" }));

    expect(mocks.mutate).toHaveBeenCalledWith({
      studentId: "student-1",
      className: "Primeira Etapa B",
      paroquiaId: "parish-1",
      date: "2026-10-10",
      reason: "Consulta médica",
    }, expect.objectContaining({ onSuccess: expect.any(Function) }));
    expect(screen.getByRole("note")).toHaveTextContent("Há nomes iguais nesta turma");
  });

  it("clears stage and student when the parish changes", () => {
    render(<Justification />);
    choose("Comunidade / Paróquia", "Comunidade Central");
    choose("Etapa do catequizando", "Primeira Etapa");
    choose("Nome do catequizando", "Ana Silva Turma B");
    choose("Comunidade / Paróquia", "Comunidade São José");

    expect(screen.getByRole("combobox", { name: "Etapa do catequizando" })).toHaveTextContent("Selecione a etapa");
    expect(screen.getByRole("combobox", { name: "Nome do catequizando" })).toHaveTextContent("Selecione a etapa primeiro");
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("shows roster errors and prevents submitting using stale selection data", () => {
    mocks.studentsError = true;
    render(<Justification />);
    choose("Comunidade / Paróquia", "Comunidade Central");
    choose("Etapa do catequizando", "Primeira Etapa");
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar os nomes");
    expect(screen.getByRole("button", { name: "Enviar justificativa" })).toBeDisabled();
  });

  it("describes success without claiming approval or completed status", async () => {
    mocks.mutate.mockImplementation((_payload, options) => options.onSuccess());
    render(<Justification />);
    choose("Comunidade / Paróquia", "Comunidade Central");
    choose("Etapa do catequizando", "Primeira Etapa");
    choose("Nome do catequizando", "Ana Silva Turma B");
    fireEvent.change(screen.getByLabelText("Motivo da falta"), { target: { value: "Consulta médica" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar justificativa" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Justificativa enviada"));
    expect(screen.getByRole("status")).toHaveTextContent("Será aplicada à falta ou guardada até a chamada");
    expect(screen.getByRole("status")).toHaveTextContent("o catequista poderá recusá-la");
    expect(screen.getByRole("status")).not.toHaveTextContent(/aprovada|falta justificada/i);
  });

  it("rejects unsupported dates before reporting receipt", () => {
    render(<Justification />);
    choose("Comunidade / Paróquia", "Comunidade Central");
    choose("Etapa do catequizando", "Primeira Etapa");
    choose("Nome do catequizando", "Ana Silva Turma B");
    fireEvent.change(screen.getByLabelText("Motivo da falta"), { target: { value: "Consulta médica" } });
    fireEvent.change(screen.getByLabelText("Data da falta"), { target: { value: "2020-01-01" } });
    expect(screen.getByRole("alert")).toHaveTextContent("últimos 366 dias");
    expect(screen.getByRole("button", { name: "Enviar justificativa" })).toBeDisabled();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
});
