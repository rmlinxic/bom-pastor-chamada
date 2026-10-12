import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Check, AlertTriangle, X, Search, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import PageHeader from "@/components/PageHeader";
import BottomActionBar from "@/components/BottomActionBar";
import { Link, useSearchParams } from "react-router-dom";
import { parseLocalDate } from "@/lib/dates";
import { useStudents } from "@/hooks/useStudents";
import { useAttendanceByDate, useSaveAttendance, usePendingJustifications, useRejectJustification } from "@/hooks/useAttendance";

type Status = "presente" | "falta_justificada" | "falta_nao_justificada";

const statusConfig: Record<Status, { icon: typeof Check; label: string; className: string }> = {
  presente: { icon: Check, label: "Presente", className: "bg-success text-success-foreground" },
  falta_nao_justificada: { icon: X, label: "Falta", className: "bg-destructive text-destructive-foreground" },
  falta_justificada: { icon: AlertTriangle, label: "Justificada", className: "bg-warning text-warning-foreground" },
};

export default function Attendance() {
  const [params, setParams] = useSearchParams();
  const date = parseLocalDate(params.get("date") ?? "") ?? new Date();
  const dateStr = format(date, "yyyy-MM-dd");
  // useStudents já filtra pelo perfil do catequista logado (apenas seus catequizandos)
  const { data: visibleStudents = [], isLoading: studentsLoading, isError: studentsError } = useStudents();
  const classFilter = params.get("turma");
  const parishFilter = params.get("paroquia");
  const studentFocus = params.get("student");
  const students = useMemo(() => visibleStudents.filter((student) =>
    (!classFilter || student.class_name === classFilter) &&
    (!parishFilter || (parishFilter === "none" ? student.paroquia_id == null : student.paroquia_id === parishFilter))
  ), [visibleStudents, classFilter, parishFilter]);
  const { data: existingAttendance = [], isLoading: attendanceLoading, isError: attendanceError } = useAttendanceByDate(dateStr);
  const { data: pendingJustifications = [] } = usePendingJustifications();
  const saveMutation = useSaveAttendance();
  const rejectMutation = useRejectJustification();

  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [search, setSearch] = useState("");
  const [calOpen, setCalOpen] = useState(false);

  // Reseta marcações ao trocar data
  useEffect(() => { setStatuses({}); }, [dateStr, classFilter, parishFilter]);

  // Detecta se já existe chamada registrada para os catequizandos DESTE perfil nesse dia
  // (filtra existingAttendance apenas pelos IDs dos catequizandos do usuário atual)
  const myStudentIds = useMemo(() => new Set(students.map((s) => s.id)), [students]);
  const myExistingAttendance = useMemo(
    () => existingAttendance.filter((a) => myStudentIds.has(a.student_id)),
    [existingAttendance, myStudentIds]
  );

  const jaRegistrada = myExistingAttendance.length > 0;
  const chamadaParcial = jaRegistrada && new Set(myExistingAttendance.map((record) => record.student_id)).size < students.length;
  const [editando, setEditando] = useState(false);
  useEffect(() => { setEditando(false); }, [dateStr, classFilter, parishFilter]);

  const getStatus = (studentId: string): Status => {
    if (statuses[studentId]) return statuses[studentId];
    const existing = myExistingAttendance.find((a) => a.student_id === studentId);
    return (existing?.status as Status) ?? "presente";
  };

  const toggleStatus = (studentId: string) => {
    const current = getStatus(studentId);
    const next: Status =
      current === "presente" ? "falta_nao_justificada"
      : current === "falta_nao_justificada" ? "falta_justificada"
      : "presente";
    setStatuses((prev) => ({ ...prev, [studentId]: next }));
  };

  const handleSave = () => {
    const records = students.map((s) => ({
      student_id: s.id,
      date: dateStr,
      status: getStatus(s.id),
      explicit_status: statuses[s.id] !== undefined,
    }));
    saveMutation.mutate(records, { onSuccess: () => { setEditando(false); setStatuses({}); } });
  };

  // Busca em tempo real
  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => s.name.toLowerCase().includes(q));
  }, [students, search]);

  const bloqueado = (jaRegistrada && !editando) || saveMutation.isPending;

  // Resumo da chamada já salva (apenas para os catequizandos deste perfil)
  const resumo = useMemo(() => {
    if (!jaRegistrada) return null;
    const p = myExistingAttendance.filter((a) => a.status === "presente").length;
    const f = myExistingAttendance.filter((a) => a.status === "falta_nao_justificada").length;
    const j = myExistingAttendance.filter((a) => a.status === "falta_justificada").length;
    return { p, f, j };
  }, [myExistingAttendance, jaRegistrada]);

  return (
    <div>
      <PageHeader title="Chamada" subtitle="Registre a presença dos catequizandos" />

      {classFilter && <div className="mx-4 mb-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm"><p className="font-semibold">Turma selecionada: {classFilter}</p><p className="mt-1 text-muted-foreground">Ao salvar, somente os catequizandos desta turma e paróquia serão registrados.</p><Link className="mt-2 inline-flex text-primary underline" to="/chamada">Limpar filtro de turma</Link></div>}
      {(studentsError || attendanceError) && <p role="alert" className="mx-4 mb-3 text-sm text-destructive">Não foi possível carregar a chamada. Atualize a página antes de salvar.</p>}

      {/* Seletor de data */}
      <div className="px-4 mb-3">
        <Popover open={calOpen} onOpenChange={setCalOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full justify-start text-left font-normal">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {format(date, "PPP", { locale: ptBR })}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={date}
              onSelect={(d) => { if (d) { const next = new URLSearchParams(params); next.set("date", format(d, "yyyy-MM-dd")); setParams(next); setCalOpen(false); } }}
              initialFocus
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Banner: chamada já registrada */}
      {jaRegistrada && (
        <div className={cn(
          "mx-4 mb-3 rounded-lg border p-3 flex items-start gap-3",
          editando ? "border-warning/40 bg-warning/10" : "border-primary/30 bg-primary/5"
        )}>
          <Info className={cn("h-5 w-5 mt-0.5 shrink-0", editando ? "text-warning" : "text-primary")} />
          <div className="flex-1 min-w-0">
            <p className={cn("font-semibold text-sm", editando ? "text-warning" : "text-primary")}>
              {editando ? "Modo de edição - salve para confirmar" : chamadaParcial ? "Chamada parcial: faltam registros nesta turma" : "Chamada já registrada neste dia"}
            </p>
            {resumo && !editando && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {resumo.p} presente{resumo.p !== 1 ? "s" : ""} · {resumo.f} falta{resumo.f !== 1 ? "s" : ""} · {resumo.j} justificada{resumo.j !== 1 ? "s" : ""}
              </p>
            )}
          </div>
          {!editando && (
            <button
              onClick={() => setEditando(true)}
              className="shrink-0 text-xs font-semibold text-primary underline underline-offset-2"
            >
              Editar
            </button>
          )}
        </div>
      )}

      {/* Busca */}
      <div className="px-4 mb-3 relative">
        <Search className="absolute left-7 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Buscar catequizando..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9"
          disabled={bloqueado}
        />
      </div>

      {/* Legenda */}
      <div className="px-4 mb-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span>Toque para alternar:</span>
        <span className="flex items-center gap-1"><Check className="h-3 w-3 text-success" /> Presente</span>
        <span className="flex items-center gap-1"><X className="h-3 w-3 text-destructive" /> Falta</span>
        <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-warning" /> Justificada</span>
      </div>

      {/* Lista */}
      <div className="space-y-2 px-4">
        {filteredStudents.map((student) => {
          const status = getStatus(student.id);
          const config = statusConfig[status];
          const Icon = config.icon;
          const savedAttendance = myExistingAttendance.find((record) => record.student_id === student.id);
          const savedReason = savedAttendance?.status === "falta_justificada"
            ? savedAttendance.justification_reason?.trim()
            : null;
          const pendingReason = pendingJustifications.find(
            (record) => record.student_id === student.id && record.date === dateStr
          )?.reason?.trim();
          return (
            <article key={student.id} className="rounded-lg border border-border bg-card shadow-sm">
            <button
              onClick={() => !bloqueado && toggleStatus(student.id)}
              disabled={bloqueado}
              className={cn(
                "flex w-full items-center justify-between rounded-lg bg-card p-4 transition-all",
                student.id === studentFocus && "ring-2 ring-primary",
                bloqueado ? "opacity-70 cursor-default" : "active:scale-[0.98]"
              )}
            >
              <div className="text-left min-w-0 flex-1 pr-3">
                <p className="font-semibold text-foreground">{student.name}</p>
                <p className="text-xs text-muted-foreground">{student.class_name}</p>
                {savedReason && (
                  <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap break-words text-foreground">
                    <span className="font-medium">Justificativa registrada: </span>{savedReason}
                  </p>
                )}
                {!savedReason && pendingReason && (
                  <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap break-words text-foreground">
                    <span className="font-medium">Justificativa enviada (pendente): </span>{pendingReason}
                  </p>
                )}
              </div>
              <span className={cn("flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold", config.className)}>
                <Icon className="h-3.5 w-3.5" />{config.label}
              </span>
            </button>
            {(savedReason || pendingReason) && <div className="px-4 pb-4"><Button variant="outline" size="sm" className="text-destructive" disabled={rejectMutation.isPending || studentsError || attendanceError} onClick={() => {
              rejectMutation.mutate({ studentId: student.id, date: dateStr }, { onSuccess: () => setStatuses((current) => {
                const next = { ...current }; delete next[student.id]; return next;
              }) });
            }}>Recusar justificativa</Button></div>}
            </article>
          );
        })}

        {filteredStudents.length === 0 && search && (
          <p className="py-8 text-center text-muted-foreground">Nenhum catequizando encontrado para "{search}".</p>
        )}
        {students.length === 0 && !studentsLoading && !studentsError && (
          <p className="py-8 text-center text-muted-foreground">Nenhum catequizando cadastrado. Cadastre catequizandos na aba "Catequizandos".</p>
        )}
      </div>

      {/* Botão salvar - só aparece se não bloqueado */}
      {students.length > 0 && !bloqueado && (
        <BottomActionBar>
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending || studentsLoading || attendanceLoading || studentsError || attendanceError}
            className="w-full h-12 text-base font-semibold"
          >
            {saveMutation.isPending ? "Salvando..." : jaRegistrada ? "Salvar Alterações" : "Salvar Chamada"}
          </Button>
        </BottomActionBar>
      )}
    </div>
  );
}
