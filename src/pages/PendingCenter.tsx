import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, ClipboardCheck, FileCheck, GraduationCap, MessageSquare, RefreshCw, Search } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useParoquias } from "@/hooks/useParoquias";
import { usePendingCenter } from "@/hooks/usePendingCenter";
import { DOCUMENT_LABELS, type PendingScope } from "@/lib/pending-center";
import { latestCatechesisSaturday, isCatechesisSaturday, parseLocalDate } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PageHeader from "@/components/PageHeader";
import { cn } from "@/lib/utils";

type Category = "attendanceGroups" | "justifications" | "documents" | "promotions";
const categories = [
  { key: "attendanceGroups", label: "Chamadas a conferir", icon: ClipboardCheck },
  { key: "justifications", label: "Justificativas", icon: MessageSquare },
  { key: "documents", label: "Documentos", icon: FileCheck },
  { key: "promotions", label: "Decisões do ano letivo", icon: GraduationCap },
] as const;
const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
function attendanceHref(date: string, className: string, parishId: string | null, studentId?: string) {
  const params = new URLSearchParams({ date, turma: className, paroquia: parishId ?? "none" });
  if (studentId) params.set("student", studentId);
  return `/chamada?${params}`;
}
function displayDate(date: string) { return parseLocalDate(date)?.toLocaleDateString("pt-BR") ?? date; }

export default function PendingCenter() {
  const { user, isAdmin, isCoordinator, isCatequista } = useAuth();
  const [params, setParams] = useSearchParams();
  const latestSaturday = latestCatechesisSaturday();
  const firstSaturday = latestCatechesisSaturday(new Date(Number(latestSaturday.slice(0, 4)), 0, 7));
  const [date, setDate] = useState(() => {
    const requested = params.get("date") ?? "";
    return isCatechesisSaturday(requested) && requested >= firstSaturday && requested <= latestSaturday ? requested : latestSaturday;
  });
  const [dateError, setDateError] = useState<string | null>(null);
  const [category, setCategory] = useState<Category>("attendanceGroups");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(30);
  const { data: parishes = [] } = useParoquias();
  const scope: PendingScope = useMemo(() => {
    if (!isAdmin && !isCoordinator || params.get("own") === "1") return { kind: "own" };
    const parishId = isAdmin ? params.get("paroquia") ?? undefined : user?.paroquia_id ?? undefined;
    const className = params.get("turma");
    if (className) return { kind: "etapa", etapa: className, paroquia_id: parishId };
    if (parishId) return { kind: "paroquia", paroquia_id: parishId };
    return isAdmin ? { kind: "all" } : { kind: "own" };
  }, [isAdmin, isCoordinator, params, user?.paroquia_id]);
  const query = usePendingCenter(date, scope);
  const { data } = query;
  const counts = data ? { attendanceGroups: data.attendanceGroups.length, justifications: data.justifications.length, documents: data.documents.length, promotions: data.promotions.length } : null;
  const total = counts ? Object.values(counts).reduce((sum, count) => sum + count, 0) : 0;
  const q = normalize(search.trim());
  const match = (item: { class_name: string; paroquia_nome: string | null; name?: string }) => !q || normalize(`${item.name ?? ""} ${item.class_name} ${item.paroquia_nome ?? ""}`).includes(q);
  const rows = data?.[category].filter(match) ?? [];
  const scopeLabel = scope.kind === "own" ? "Minha turma" : scope.kind === "all" ? "Todas as paróquias" : scope.kind === "etapa" ? scope.etapa : parishes.find((p) => p.id === scope.paroquia_id)?.nome ?? user?.paroquia_nome ?? "Minha paróquia";
  function changeFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    next.delete("turma"); next.delete("own"); next.delete("paroquia");
    if (value) next.set(key, value);
    setParams(next); setLimit(30);
  }

  return (
    <div className="pb-28">
      <PageHeader title="Central de pendências" subtitle={scopeLabel} />
      <div className="space-y-4 px-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link to="/" className="inline-flex items-center gap-1 text-sm font-medium text-primary"><ArrowLeft className="h-4 w-4" /> Voltar ao início</Link>
          <Button variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching || !date}><RefreshCw className={cn("mr-2 h-4 w-4", query.isFetching && "animate-spin")} />Atualizar</Button>
        </div>
        {(isAdmin || isCoordinator) && (
          <div className="flex flex-wrap items-end gap-3">
            {isAdmin && <div className="min-w-0 flex-1"><Label htmlFor="pending-parish">Paróquia</Label><select id="pending-parish" className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={scope.kind === "own" ? "own" : params.get("paroquia") ?? ""} onChange={(e) => changeFilter(e.target.value === "own" ? "own" : "paroquia", e.target.value === "own" ? "1" : e.target.value)}><option value="">Todas as paróquias</option>{parishes.filter((p) => p.ativa).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></div>}
            {isCoordinator && !isAdmin && isCatequista && <div><Label htmlFor="pending-scope">Visualização</Label><select id="pending-scope" className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={scope.kind === "own" ? "own" : "parish"} onChange={(e) => changeFilter("own", e.target.value === "own" ? "1" : "")}><option value="parish">Toda a minha paróquia</option><option value="own">Minha turma</option></select></div>}
            {scope.kind === "etapa" && <Button variant="outline" size="sm" onClick={() => { const next = new URLSearchParams(params); next.delete("turma"); setParams(next); }}>Limpar filtro de turma</Button>}
          </div>
        )}
        <div className="surface-card rounded-xl p-4">
          <Label htmlFor="pending-date">Sábado para conferir chamadas</Label>
          <Input id="pending-date" type="date" min={firstSaturday} max={latestSaturday} step={7} value={date} aria-invalid={!!dateError} aria-describedby={dateError ? "pending-date-error" : "pending-date-help"} className="mt-2 max-w-xs" onChange={(e) => {
            const value = e.target.value;
            if (!value || (isCatechesisSaturday(value) && value >= firstSaturday && value <= latestSaturday)) { setDate(value); setDateError(null); setLimit(30); }
            else setDateError("Escolha um sábado até o último sábado disponível.");
          }} />
          {dateError && <p id="pending-date-error" role="alert" className="mt-2 text-sm text-destructive">{dateError}</p>}
          <p id="pending-date-help" className="mt-2 text-xs leading-relaxed text-muted-foreground">A catequese acontece todos os sábados. As chamadas consideram os catequizandos ativos no cadastro atual e abrem no último sábado. Justificativas, documentos e decisões mostram todas as pendências, independentemente desse sábado.</p>
        </div>
        {!date ? <p role="status" className="rounded-xl border border-border p-5">Selecione uma data para consultar a central.</p> : query.isPending ? <p role="status" className="rounded-xl border border-border p-5">Carregando pendências...</p> : query.isError ? <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-5"><p className="font-semibold">Não foi possível carregar as pendências.</p><p className="mt-1 text-sm">Tente atualizar novamente. Nenhuma pendência foi considerada resolvida.</p></div> : data && <>
          <p aria-live="polite" className="text-sm text-muted-foreground">{total} {total === 1 ? "item para conferir" : "itens para conferir"} · {data.studentsCount} catequizandos nesta visualização</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Categorias de pendências">
            {categories.filter((item) => item.key !== "promotions" || data.canReviewPromotions).map(({ key, label, icon: Icon }) => <button key={key} aria-pressed={category === key} onClick={() => { setCategory(key); setLimit(30); }} className={cn("rounded-xl border p-4 text-left transition-colors", category === key ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/50")}><Icon className="mb-2 h-5 w-5 text-primary" aria-hidden="true" /><p className="text-2xl font-bold">{counts![key]}</p><p className="mt-1 text-sm font-medium">{label}</p></button>)}
          </div>
          <div className="relative"><Label htmlFor="pending-search" className="sr-only">Buscar pendências por nome, turma ou paróquia</Label><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" /><Input id="pending-search" className="pl-9" placeholder="Buscar por nome, turma ou paróquia..." value={search} onChange={(e) => { setSearch(e.target.value); setLimit(30); }} /></div>
          <h2 className="text-lg font-semibold">{categories.find((item) => item.key === category)?.label}</h2>
          {rows.length === 0 && <p role="status" className="surface-card rounded-xl p-6 text-center text-sm text-muted-foreground">{search.trim() ? "Nenhuma pendência corresponde à busca nesta categoria." : category === "attendanceGroups" ? "Todas as turmas desta visualização têm registros completos na data selecionada." : "Nenhuma pendência nesta categoria."}</p>}
          <div className="space-y-3">
            {category === "attendanceGroups" && data.attendanceGroups.filter(match).slice(0, limit).map((item) => <article key={item.id} className="surface-card rounded-xl p-4"><h3 className="font-semibold">{item.class_name}</h3><p className="mt-1 text-xs text-muted-foreground">{item.paroquia_nome ?? "Sem paróquia informada"} · {displayDate(date)}</p><p className="mt-3 text-sm">{item.recorded === 0 ? "Chamada sem registros" : `Chamada parcial: ${item.recorded} de ${item.total} registros`}. {item.missing} catequizando(s) sem registro.</p><Link className="mt-3 inline-flex text-sm font-semibold text-primary underline underline-offset-4" to={attendanceHref(date, item.class_name, item.paroquia_id)}>Conferir chamada</Link></article>)}
            {category === "justifications" && data.justifications.filter(match).slice(0, limit).map((item) => <article key={item.id} className="surface-card rounded-xl p-4"><h3 className="font-semibold">{item.name}</h3><p className="mt-1 text-xs text-muted-foreground">{item.class_name} · {item.paroquia_nome ?? "Sem paróquia informada"} · {displayDate(item.date)}</p><p className="mt-3 whitespace-pre-wrap break-words text-sm">{item.reason}</p><Link className="mt-3 inline-flex text-sm font-semibold text-primary underline underline-offset-4" to={attendanceHref(item.date, item.class_name, item.paroquia_id, item.student_id)}>Conferir na chamada</Link></article>)}
            {category === "documents" && data.documents.filter(match).slice(0, limit).map((item) => <article key={item.student_id} className="surface-card rounded-xl p-4"><h3 className="font-semibold">{item.name}</h3><p className="mt-1 text-xs text-muted-foreground">{item.class_name} · {item.paroquia_nome ?? "Sem paróquia informada"}</p><ul className="mt-3 list-inside list-disc space-y-1 text-sm">{item.missing.map((key) => <li key={key}>{DOCUMENT_LABELS[key]}</li>)}</ul><Link className="mt-3 inline-flex text-sm font-semibold text-primary underline underline-offset-4" to={`/alunos?${new URLSearchParams({ student: item.student_id, documentos: "1" })}`}>Conferir documentos</Link></article>)}
            {category === "promotions" && data.canReviewPromotions && data.promotions.filter(match).slice(0, limit).map((item) => <article key={item.id} className="surface-card rounded-xl p-4"><h3 className="font-semibold">{item.name}</h3><p className="mt-1 text-xs text-muted-foreground">{item.class_name} · {item.paroquia_nome ?? "Sem paróquia informada"} · Ano {item.ano_catequetico}</p><p className="mt-3 text-sm">Decisão de promoção ou permanência aguardando a coordenação.</p>{item.paroquia_id ? <Link className="mt-3 inline-flex text-sm font-semibold text-primary underline underline-offset-4" to={`/coordenador?${new URLSearchParams({ paroquia: item.paroquia_id, ano: String(item.ano_catequetico), promocao: item.id })}`}>Conferir decisão</Link> : <p className="mt-3 text-sm text-muted-foreground">Revise a paróquia do cadastro antes de registrar a decisão.</p>}</article>)}
          </div>
          {rows.length > limit && <Button variant="outline" className="w-full" onClick={() => setLimit((value) => value + 30)}>Mostrar mais ({rows.length - limit} restantes)</Button>}
        </>}
      </div>
    </div>
  );
}
