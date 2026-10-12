import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/hooks/useStudents", () => ({ useStudents: () => ({ data: [{ id: "s", name: "Ana", class_name: "Quarta Etapa" }], isLoading: false }), useDeleteStudent: () => ({ mutate: vi.fn() }), useImportStudents: () => ({ mutate: vi.fn() }) }));
vi.mock("@/hooks/useAttendance", () => ({ useAllAttendance: () => ({ data: [] }) }));
vi.mock("@/hooks/useDocumentos", () => ({ useAllDocumentos: () => ({ data: [] }) }));
vi.mock("@/components/StudentForm", () => ({ default: () => null }));
vi.mock("@/components/DocumentosModal", () => ({ default: ({ student, onClose }: { student: { name: string }; onClose: () => void }) => <div role="dialog">Documentos de {student.name}<button onClick={onClose}>Fechar documentos</button></div> }));
import Students from "./Students";
describe("document links from pending center", () => {
  it("opens only an authorized student's checklist", () => {
    render(<MemoryRouter initialEntries={["/alunos?student=s&documentos=1"]}><Students /></MemoryRouter>);
    expect(screen.getByRole("dialog")).toHaveTextContent("Documentos de Ana");
    fireEvent.click(screen.getByRole("button", { name: "Fechar documentos" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("does not open or show a student absent from the authorized roster", () => {
    render(<MemoryRouter initialEntries={["/alunos?student=outside&documentos=1"]}><Students /></MemoryRouter>);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("Ana")).not.toBeInTheDocument();
    expect(screen.getByText("Cadastro indisponível nesta visualização.")).toBeInTheDocument();
  });
});
