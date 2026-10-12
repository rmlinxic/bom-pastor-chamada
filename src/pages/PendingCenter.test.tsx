import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { localDateString } from "@/lib/dates";
import type { PendingCenterData } from "@/lib/pending-center";

const mocks = vi.hoisted(() => ({ query: { data: undefined as PendingCenterData | undefined, isPending: false, isError: false, isFetching: false, refetch: vi.fn() }, role: "admin", load: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "staff", role: mocks.role, paroquia_id: "p", paroquia_nome: "Bom Pastor" }, isAdmin: mocks.role === "admin", isCoordinator: mocks.role === "coordenador", isCatequista: mocks.role === "catequista" }) }));
vi.mock("@/hooks/useParoquias", () => ({ useParoquias: () => ({ data: [{ id: "p", nome: "Bom Pastor", ativa: true }] }) }));
vi.mock("@/hooks/usePendingCenter", () => ({ usePendingCenter: (...args: unknown[]) => { mocks.load(...args); return mocks.query; } }));
import PendingCenter from "./PendingCenter";

function fixture(): PendingCenterData {
  return { date: localDateString(), year: 2026, studentsCount: 3, canReviewPromotions: true,
    attendanceGroups: [{ id: "group", class_name: "Quarta Etapa A", paroquia_id: "p", paroquia_nome: "Bom Pastor", total: 3, recorded: 1, missing: 2, status: "partial" }],
    justifications: [{ id: "j", student_id: "s", name: "Ana", class_name: "Quarta Etapa A", paroquia_id: "p", paroquia_nome: "Bom Pastor", date: "2026-10-01", reason: "Consulta médica" }],
    documents: [{ student_id: "s", name: "Ana", class_name: "Quarta Etapa A", paroquia_id: "p", paroquia_nome: "Bom Pastor", missing: ["batismo"] }],
    promotions: [{ id: "promo", student_id: "s", name: "Ana", class_name: "Quarta Etapa A", paroquia_id: "p", paroquia_nome: "Bom Pastor", ano_catequetico: 2025, decisao: null, destino_class_name: "Quinta Etapa", score_faltas: 2, faltas_nao_justificadas: 2, meses_sem_missa: 0 }],
  };
}
function mount(route = "/pendencias") { return render(<MemoryRouter initialEntries={[route]}><PendingCenter /></MemoryRouter>); }
beforeEach(() => { vi.clearAllMocks(); mocks.role = "admin"; mocks.query.data = fixture(); mocks.query.isError = false; mocks.query.isPending = false; });

describe("pending center navigation", () => {
  it("distinguishes partial calls and links to the exact date, class and parish", () => {
    mount();
    expect(screen.getByText(/Chamada parcial: 1 de 3 registros/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Conferir chamada" });
    const params = new URLSearchParams(link.getAttribute("href")!.split("?")[1]);
    expect(params.get("date")).toBe(localDateString());
    expect(params.get("turma")).toBe("Quarta Etapa A");
    expect(params.get("paroquia")).toBe("p");
  });
  it("opens a justification on its own date, independent of the call filter", () => {
    mount(); fireEvent.click(screen.getByRole("button", { name: /Justificativas/ }));
    expect(screen.getByText("Consulta médica")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Conferir na chamada" })).toHaveAttribute("href", "/chamada?date=2026-10-01&turma=Quarta+Etapa+A&paroquia=p&student=s");
  });
  it("opens the student's documents and the promotion's original year", () => {
    mount(); fireEvent.click(screen.getByRole("button", { name: /Documentos/ }));
    expect(screen.getByText("Comprovante de Batismo")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Conferir documentos" })).toHaveAttribute("href", "/alunos?student=s&documentos=1");
    fireEvent.click(screen.getByRole("button", { name: /Decisões do ano letivo/ }));
    expect(screen.getByRole("link", { name: "Conferir decisão" })).toHaveAttribute("href", "/coordenador?paroquia=p&ano=2025&promocao=promo");
  });
  it("shows failures instead of stale successful data or an all-clear message", () => {
    mocks.query.isError = true; mount();
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar");
    expect(screen.queryByText("Ana")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Chamadas a conferir/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Atualizar" })); expect(mocks.query.refetch).toHaveBeenCalled();
  });
  it("defaults catechists to their own roster and hides coordinator decisions", () => {
    mocks.role = "catequista"; mocks.query.data!.canReviewPromotions = false; mocks.query.data!.promotions = [];
    mount("/pendencias?paroquia=another");
    expect(mocks.load).toHaveBeenLastCalledWith(localDateString(), { kind: "own" });
    expect(screen.queryByRole("button", { name: /Decisões do ano letivo/ })).not.toBeInTheDocument();
  });
  it("searches within the chosen category without claiming everything was resolved", () => {
    mount(); fireEvent.change(screen.getByRole("textbox", { name: /Buscar pendências/ }), { target: { value: "sem correspondência" } });
    expect(screen.getByRole("status")).toHaveTextContent("Nenhuma pendência corresponde à busca");
  });
});
