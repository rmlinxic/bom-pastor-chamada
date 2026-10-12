import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ isLoading: false, isError: false, mutate: vi.fn() }));
vi.mock("@/hooks/useDocumentos", () => ({ useDocumentosStudent: () => ({ data: null, isLoading: mocks.isLoading, isError: mocks.isError }), useSaveDocumentos: () => ({ mutate: mocks.mutate, isPending: false }) }));
import DocumentosModal from "./DocumentosModal";
const student = { id: "s", name: "Ana", class_name: "Quarta Etapa" };
beforeEach(() => { vi.clearAllMocks(); mocks.isLoading = false; mocks.isError = false; });
describe("document checklist from pending center", () => {
  it.each(["isLoading", "isError"] as const)("prevents overwriting documents when %s", (state) => {
    mocks[state] = true; render(<DocumentosModal student={student} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Salvar" })); expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("saves the checklist for the selected student", () => {
    render(<DocumentosModal student={student} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Comprovante de Batismo" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(mocks.mutate).toHaveBeenCalledWith({ student_id: "s", batismo: true, endereco: false, crisma_padrinho: false, primeira_comunhao: false }, expect.any(Object));
  });
});
