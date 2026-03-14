import { useState, useMemo } from "react";
import { format, getDaysInMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ChevronLeft, ChevronRight, Church,
  CheckCircle2, AlertTriangle, Trash2, Clock, Filter,
  Users, CheckSquare, Square, UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import PageHeader from "@/components/PageHeader";
import { useStudents } from "@/hooks/useStudents";
import { useAuth } from "@/contexts/AuthContext";
import {
  useMassAttendanceByMonth, useRegisterMassAttendance, useDeleteMassAttendance,
} from "@/hooks/useMassAttendance";
import { ETAPAS } from "@/lib/etapas";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

const db = supabase as any;

function todayMonthStr() { return new Date().toISOString().slice(0, 7); }
function shiftMonth(m: string, d: number) {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1 + d, 1).toISOString().slice(0, 7);
}
function monthLabel(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return format(new Date(y, mo - 1, 1), "MMMM yyyy", { locale: ptBR });
}

export default function Missas() {
  const { user, isCoordinator, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const { data: allStudents = [] } = useStudents();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(todayMonthStr);
  const [filtroEtapa, setFiltroEtapa] = useState<string>("all");

  const canFilterEtapa = isCoordinator || isAdmin;

  const students = useMemo(() => {
    if (!canFilterEtapa || filtroEtapa === "all") return allStudents;
    return allStudents.filter((s) => s.class_name === filtroEtapa);
  }, [allStudents, filtroEtapa, canFilterEtapa]);

  const studentIds = useMemo(() => allStudents.map((s) => s.id), [allStudents]);

  const { data: massRecords = [], isLoading } = useMassAttendanceByMonth(studentIds, currentMonth);
  const deleteMutation = useDeleteMassAttendance();

  const today = new Date();
  const thisMonth = todayMonthStr();
  const isCurrentMonth = currentMonth === thisMonth;
  const isPastMonth = currentMonth < thisMonth;
  const daysLeft = getDaysInMonth(today) - today.getDate();

  const visibleStudentIds = useMemo(() => new Set(students.map((s) => s.id)), [students]);
  const visibleMassRecords = useMemo(
    () => massRecords.filter((r) => visibleStudentIds.has(r.student_id)),
    [massRecords, visibleStudentIds]
  );
  const studentsWithMass = useMemo(
    () => new Set(visibleMassRecords.map((r) => r.student_id)),
    [visibleMassRecords]
  );
  const studentsWithoutMass = useMemo(
    () => students.filter((s) => !studentsWithMass.has(s.id)),
    [students, studentsWithMass]
  );
  const recordsByStudent = useMemo(() => {
    const map: Record<string, typeof visibleMassRecords> = {};
    visibleMassRecords.forEach((r) => {
      if (!map[r.student_id]) map[r.student_id] = [];
      map[r.student_id].push(r);
    });
    return map;
  }, [visibleMassRecords]);

  const isEndOfMonthAlert = isCurrentMonth && daysLeft <= 7 && studentsWithoutMass.length > 0;

  // Lista de alunos exibida no formulário (todos, não filtrado por etapa)
  const formStudents = useMemo(
    () => [...allStudents].sort((a, b) =>
      a.class_name !== b.class_name
        ? a.class_name.localeCompare(b.class_name)
        : a.name.localeCompare(b.name)
    ),
    [allStudents]
  );

  // Agrupar por etapa para exibir no formulário
  const byEtapa = useMemo(() => {
    const map: Record<string, typeof formStudents> = {};
    formStudents.forEach((s) => {
      if (!map[s.class_name]) map[s.class_name] = [];
      map[s.class_name].push(s);
    });
    return map;
  }, [formStudents]);

  const allFormIds = useMemo(() => formStudents.map((s) => s.id), [formStudents]);
  const allSelected = allFormIds.length > 0 && allFormIds.every((id) => selectedIds.has(id));
  const someSelected = selectedIds.size > 0 && !allSelected;

  function toggleStudent(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleEtapa(ids: string[]) {
    const allChecked = ids.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => allChecked ? next.delete(id) : next.add(id));
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(allFormIds));
  }

  async function handleRegisterMultiple() {
    if (selectedIds.size === 0 || !selectedDate || isSaving) return;
    setIsSaving(true);
    try {
      const dateStr = selectedDate;
      const rows = Array.from(selectedIds).map((student_id) => ({ student_id, date: dateStr }));
      // upsert para evitar duplicatas (student_id + date)
      const { error } = await db
        .from("mass_attendance")
        .upsert(rows, { onConflict: "student_id,date", ignoreDuplicates: true });
      if (error) throw error;
      toast.success(`${rows.length} presença${rows.length !== 1 ? "s" : ""} registrada${rows.length !== 1 ? "s" : ""} com sucesso!`);
      setSelectedIds(new Set());
      setSelectedDate("");
      queryClient.invalidateQueries({ queryKey: ["mass-attendance"] });
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao registrar presenças.");
    } finally {
      setIsSaving(false);
    }
  }

  const handleDelete = (id: string, name: string, date: string) => {
    if (window.confirm(`Remover presença de "${name}" em ${date}?`)) deleteMutation.mutate(id);
  };

  const subtitle = canFilterEtapa
    ? (filtroEtapa === "all" ? "Toda a paróquia" : filtroEtapa)
    : (user?.etapa ?? "sua etapa");

  const dateLabel = selectedDate
    ? format(new Date(selectedDate + "T12:00:00"), "dd/MM/yyyy (EEEE)", { locale: ptBR })
    : "";

  return (
    <div className="pb-24">
      <PageHeader title="Missas" subtitle={`Presenças na missa — ${subtitle}`} />

      {/* Filtro de etapa para coordenador/admin */}
      {canFilterEtapa && (
        <div className="mx-4 mb-4 flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
          <Select value={filtroEtapa} onValueChange={setFiltroEtapa}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Filtrar por etapa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as etapas</SelectItem>
              {ETAPAS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Formulário de registro múltiplo */}
      <div className="mx-4 mb-5 rounded-lg border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
          <Church className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Registrar Presença</span>
        </div>

        {/* Data da missa */}
        <div className="px-4 pt-4 pb-3 border-b border-border/50 space-y-1.5">
          <Label>Data da Missa</Label>
          <input
            type="date"
            value={selectedDate}
            max={today.toISOString().slice(0, 10)}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {selectedDate && (
            <p className="text-xs text-muted-foreground capitalize">{dateLabel}</p>
          )}
        </div>

        {/* Cabeçalho da lista de alunos */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/50">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Alunos</span>
          </div>
          <button
            onClick={toggleAll}
            className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            {allSelected
              ? <><CheckSquare className="h-4 w-4" /> Desmarcar todos</>
              : <><Square className="h-4 w-4" /> Selecionar todos</>
            }
          </button>
        </div>

        {/* Lista agrupada por etapa */}
        <div className="max-h-72 overflow-y-auto divide-y divide-border/40">
          {Object.entries(byEtapa).map(([etapa, etapaStudents]) => {
            const etapaIds = etapaStudents.map((s) => s.id);
            const allEtapaChecked = etapaIds.every((id) => selectedIds.has(id));
            return (
              <div key={etapa}>
                {/* Linha de etapa (clica para marcar todos da etapa) */}
                <button
                  onClick={() => toggleEtapa(etapaIds)}
                  className="w-full flex items-center gap-2 px-4 py-2 bg-muted/50 hover:bg-muted transition-colors text-left"
                >
                  <span className={cn(
                    "flex h-4 w-4 items-center justify-center rounded border text-[10px] font-bold transition-colors",
                    allEtapaChecked ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground"
                  )}>
                    {allEtapaChecked ? "✓" : ""}
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground">{etapa}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {etapaIds.filter((id) => selectedIds.has(id)).length}/{etapaIds.length}
                  </span>
                </button>
                {/* Alunos da etapa */}
                {etapaStudents.map((s) => {
                  const checked = selectedIds.has(s.id);
                  const jaTemNestaMissa = selectedDate
                    ? (recordsByStudent[s.id] ?? []).some((r) => r.date === selectedDate)
                    : false;
                  return (
                    <button
                      key={s.id}
                      onClick={() => toggleStudent(s.id)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                        checked ? "bg-primary/8" : "hover:bg-muted/40",
                        jaTemNestaMissa && "opacity-60"
                      )}
                    >
                      <span className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors",
                        checked ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground bg-background"
                      )}>
                        {checked && <span className="text-xs font-bold">✓</span>}
                      </span>
                      <span className={cn("flex-1 text-sm font-medium", checked && "text-primary")}>
                        {s.name}
                      </span>
                      {jaTemNestaMissa && (
                        <span className="text-[10px] text-success font-semibold bg-success/10 rounded-full px-2 py-0.5">
                          já registrada
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
          {formStudents.length === 0 && (
            <p className="px-4 py-6 text-sm text-center text-muted-foreground">Nenhum aluno cadastrado.</p>
          )}
        </div>

        {/* Rodapé com contador e botão */}
        <div className="px-4 py-3 border-t border-border bg-muted/20">
          {selectedIds.size > 0 && (
            <p className="text-xs text-muted-foreground mb-2">
              <span className="font-semibold text-primary">{selectedIds.size} aluno{selectedIds.size !== 1 ? "s" : ""}</span> selecionado{selectedIds.size !== 1 ? "s" : ""}
              {selectedDate && <> para <span className="font-semibold text-foreground capitalize">{dateLabel}</span></>}
            </p>
          )}
          <Button
            className="w-full h-11"
            onClick={handleRegisterMultiple}
            disabled={selectedIds.size === 0 || !selectedDate || isSaving}
          >
            <UserCheck className="h-4 w-4 mr-2" />
            {isSaving
              ? "Registrando..."
              : selectedIds.size === 0
              ? "Selecione aluno(s) e data"
              : `Confirmar ${selectedIds.size} presença${selectedIds.size !== 1 ? "s" : ""}`}
          </Button>
        </div>
      </div>

      {/* Navegação de mês */}
      <div className="flex items-center justify-between px-4 mb-4">
        <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(shiftMonth(currentMonth, -1))}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="text-center">
          <p className="font-semibold text-foreground capitalize">{monthLabel(currentMonth)}</p>
          <p className="text-xs text-muted-foreground">{visibleMassRecords.length} registro{visibleMassRecords.length !== 1 ? "s" : ""}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(shiftMonth(currentMonth, 1))} disabled={!isPastMonth && isCurrentMonth}>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {isEndOfMonthAlert && (
        <div className="mx-4 mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <span className="font-bold text-destructive">Atenção — Fim do Mês</span>
          </div>
          <p className="text-sm text-destructive">
            Faltam <strong>{daysLeft} dia{daysLeft !== 1 ? "s" : ""}</strong> e{" "}
            <strong>{studentsWithoutMass.length} aluno{studentsWithoutMass.length !== 1 ? "s" : ""}</strong>{" "}
            ainda não {studentsWithoutMass.length !== 1 ? "têm" : "tem"} registro de missa.
          </p>
        </div>
      )}

      {studentsWithoutMass.length > 0 && (
        <div className="mx-4 mb-4 rounded-lg border border-warning/40 bg-warning/10 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-warning" />
            <span className="text-sm font-semibold text-warning">Sem registro neste mês ({studentsWithoutMass.length})</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {studentsWithoutMass.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    next.has(s.id) ? next.delete(s.id) : next.add(s.id);
                    return next;
                  });
                  // Scroll para o topo
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className={cn(
                  "text-xs rounded-full px-3 py-1 font-medium transition-colors",
                  selectedIds.has(s.id)
                    ? "bg-primary text-primary-foreground"
                    : "bg-warning/20 text-warning hover:bg-warning/40"
                )}
                title="Clique para selecionar no formulário"
              >
                {s.name}{canFilterEtapa && filtroEtapa === "all" ? ` (${s.class_name})` : ""}
              </button>
            ))}
          </div>
          {studentsWithoutMass.length > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              Clique em um aluno para selecioná-lo rapidamente no formulário acima.
            </p>
          )}
        </div>
      )}

      <div className="px-4 space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : visibleMassRecords.length === 0 ? (
          <div className="py-10 text-center">
            <Church className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-muted-foreground text-sm">Nenhuma presença registrada neste mês.</p>
            {isPastMonth && <p className="text-xs text-destructive mt-2 font-medium">⚠ Mês encerrado sem registros de missa.</p>}
          </div>
        ) : (
          students.filter((s) => studentsWithMass.has(s.id)).map((s) => {
            const recs = recordsByStudent[s.id] ?? [];
            return (
              <div key={s.id} className="rounded-lg border border-success/30 bg-success/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                  <p className="font-semibold text-foreground flex-1">{s.name}</p>
                  {canFilterEtapa && filtroEtapa === "all" && (
                    <span className="text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5">{s.class_name}</span>
                  )}
                  <span className="text-xs bg-success/20 text-success rounded-full px-2 py-0.5 font-medium">{recs.length}× no mês</span>
                </div>
                <div className="space-y-1 pl-6">
                  {recs.map((r) => (
                    <div key={r.id} className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        {format(new Date(r.date + "T12:00:00"), "dd/MM/yyyy (EEEE)", { locale: ptBR })}
                      </span>
                      <button onClick={() => handleDelete(r.id, s.name, r.date)}
                        disabled={deleteMutation.isPending}
                        className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="mx-4 mt-6 rounded-lg bg-muted/40 border border-border p-3">
        <p className="text-xs text-muted-foreground">
          <strong className="text-foreground">Regra:</strong> cada catequizando deve comparecer a{" "}
          <strong>no mínimo 1 missa por mês</strong>. Alunos sem registro aparecem em amarelo.
          Nos últimos 7 dias do mês o aviso fica vermelho.
        </p>
      </div>
    </div>
  );
}
