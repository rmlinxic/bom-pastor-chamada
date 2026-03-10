import { useState, useMemo } from "react";
import { format, getDaysInMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ChevronLeft, ChevronRight, Church, CalendarIcon,
  CheckCircle2, AlertTriangle, Trash2, Clock, Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
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
  const { data: allStudents = [] } = useStudents();

  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [currentMonth, setCurrentMonth] = useState(todayMonthStr);
  // Coordenador/admin podem filtrar por etapa
  const [filtroEtapa, setFiltroEtapa] = useState<string>("all");

  const canFilterEtapa = isCoordinator || isAdmin;

  // Aplica filtro de etapa se coordenador/admin selecionou uma
  const students = useMemo(() => {
    if (!canFilterEtapa || filtroEtapa === "all") return allStudents;
    return allStudents.filter((s) => s.class_name === filtroEtapa);
  }, [allStudents, filtroEtapa, canFilterEtapa]);

  const studentIds = useMemo(() => allStudents.map((s) => s.id), [allStudents]);

  const { data: massRecords = [], isLoading } = useMassAttendanceByMonth(studentIds, currentMonth);
  const registerMutation = useRegisterMassAttendance();
  const deleteMutation = useDeleteMassAttendance();

  const today = new Date();
  const thisMonth = todayMonthStr();
  const isCurrentMonth = currentMonth === thisMonth;
  const isPastMonth = currentMonth < thisMonth;
  const daysLeft = getDaysInMonth(today) - today.getDate();

  // filtra registros para os alunos visíveis (respeitando filtro de etapa)
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

  const handleRegister = () => {
    if (!selectedStudentId || !selectedDate) return;
    registerMutation.mutate(
      { studentId: selectedStudentId, date: format(selectedDate, "yyyy-MM-dd") },
      { onSuccess: () => { setSelectedStudentId(""); setSelectedDate(undefined); } }
    );
  };

  const handleDelete = (id: string, name: string, date: string) => {
    if (window.confirm(`Remover presença de "${name}" em ${date}?`)) deleteMutation.mutate(id);
  };

  const subtitle = canFilterEtapa
    ? (filtroEtapa === "all" ? "Toda a paróquia" : filtroEtapa)
    : (user?.etapa ?? "sua etapa");

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

      {/* Formulário de registro */}
      <div className="mx-4 mb-5 rounded-lg border border-border bg-card p-4 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Church className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Registrar Presença</span>
        </div>
        <div className="space-y-1.5">
          <Label>Aluno</Label>
          <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o aluno" />
            </SelectTrigger>
            <SelectContent>
              {allStudents.length === 0 && (
                <div className="px-3 py-4 text-sm text-center text-muted-foreground">Nenhum aluno cadastrado.</div>
              )}
              {allStudents.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}{canFilterEtapa ? ` — ${s.class_name}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Data da Missa</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !selectedDate && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {selectedDate ? format(selectedDate, "PPP", { locale: ptBR }) : "Selecione a data"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={selectedDate} onSelect={setSelectedDate}
                disabled={(d) => d > today} initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>
        <Button className="w-full h-11" onClick={handleRegister}
          disabled={!selectedStudentId || !selectedDate || registerMutation.isPending}>
          {registerMutation.isPending ? "Registrando..." : "Confirmar Presença"}
        </Button>
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
              <span key={s.id} className="text-xs bg-warning/20 text-warning rounded-full px-3 py-1 font-medium">
                {s.name}{canFilterEtapa && filtroEtapa === "all" ? ` (${s.class_name})` : ""}
              </span>
            ))}
          </div>
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
