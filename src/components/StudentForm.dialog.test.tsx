import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ add: vi.fn(), update: vi.fn() }));
vi.mock("@/hooks/useStudents", () => ({
  useAddStudent: () => ({ mutate: mocks.add, isPending: false }),
  useUpdateStudent: () => ({ mutate: mocks.update, isPending: false }),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ isAdmin: false, isCoordinator: false, user: { etapa: "Primeira Etapa A" } }) }));
import StudentForm from "./StudentForm";

beforeEach(() => vi.clearAllMocks());
describe("student dialog form", () => {
  it("requires a name and submits the sanitized form", () => {
    const onClose = vi.fn();
    render(<StudentForm onClose={onClose} />);
    const submit = screen.getByRole("button", { name: "Cadastrar" });
    expect(submit).toBeDisabled();
    expect(screen.getByLabelText("Nome do catequizando *")).toHaveFocus();
    fireEvent.change(screen.getByLabelText("Nome do catequizando *"), { target: { value: "  Ana  " } });
    fireEvent.change(screen.getByLabelText("Nome do responsável"), { target: { value: "  Maria  " } });
    fireEvent.change(screen.getByLabelText("Telefone / WhatsApp"), { target: { value: "(41) 99999-9999abc" } });
    fireEvent.click(submit);
    expect(mocks.add).toHaveBeenCalledWith({ name: "Ana", parent_name: "Maria", phone: "(41) 99999-9999", class_name: "Primeira Etapa A" }, { onSuccess: onClose });
  });

  it("retains existing fields and uses the edit mutation", () => {
    const onClose = vi.fn();
    const student = { id: "student", name: "Ana", class_name: "Segunda Etapa B", parent_name: "Maria", phone: "41999999999" };
    render(<StudentForm student={student} onClose={onClose} />);
    expect(screen.getByRole("dialog", { name: "Editar Catequizando" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(mocks.update).toHaveBeenCalledWith(student, { onSuccess: onClose });
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it("closes via cancel and Escape", () => {
    const onClose = vi.fn();
    render(<StudentForm onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
