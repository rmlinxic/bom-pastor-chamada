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
import { useStudents } from "@/hooks/useStudents";
import { useAttendanceByDate, useSaveAttendance } from "@/hooks/useAttendance";

type Status = "presente" | "falta_justificada" | "falta_nao_justificada";

const statusConfig: Record<Status, { icon: typeof Check; label: string; className: string }> = {
  presente: { icon: Check, label: "Presente", className: "bg-success text-success-foreground" },
  falta_nao_justificada: { icon: X, label: "Falta", className: "bg-destructive text-destructive-foreground" },
  falta_justificada: { icon: AlertTriangle, label: "Justificada", className: "bg-warning text-warning-foreground" },
};

export default function Attendance() {
  const [date, setDate] = useState<Date>(new Date());
  const dateStr = format(date, "yyyy-MM-dd");
  const { data: students = [] } = useStudents();
  const { data: existingAttendance = [] } = useAttendanceByDate(dateStr);
  const saveMutation = useSaveAttendance();

  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [search, setSearch] = useState("");
  const [calOpen, setCalOpen] = useState(false);

  // Reseta marcações ao trocar data
  useEffect(() => { setStatuses({}); }, [dateStr]);

  // Detecta se já existe chamada registrada para esse dia
  const jaRegistrada = existingAttendance.length > 0;
  const [editando, setEditando] = useState(false);
  useEffect(() => { setEditando(false); }, [dateStr]);

  const getStatus = (studentId: string): Status => {
    if (statuses[studentId]) return statuses[studentId];
    const existing = existingAttendance.find((a) => a.student_id === studentId);
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
    }));
    saveMutation.mutate(records, { onSuccess: () => setEditando(false) });
  };

  // Busca em tempo real
  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => s.name.toLowerCase().includes(q));
  }, [students, search]);

  const bloqueado = jaRegistrada && !editando;

  // Resumo da chamada já salva
  const resumo = useMemo(() => {
    if (!jaRegistrada) return null;
    const p = existingAttendance.filter((a) => a.status === "presente").length;
    const f = existingAttendance.filter((a) => a.status === "falta_nao_justificada").length;
    const j = existingAttendance.filter((a) => a.status === "falta_justificada").length;
    return { p, f, j };
  }, [existingAttendance, jaRegistrada]);

  return (
    <div className="pb-24">
      <PageHeader title="Chamada" subtitle="Registre a presença dos catequizandos" />

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
              onSelect={(d) => { if (d) { setDate(d); setCalOpen(false); } }}
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
              {editando ? "Modo de edição — salve para confirmar" : "Chamada já registrada neste dia"}
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
          placeholder="Buscar aluno..."
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
          return (
            <button
              key={student.id}
              onClick={() => !bloqueado && toggleStatus(student.id)}
              disabled={bloqueado}
              className={cn(
                "flex w-full items-center justify-between rounded-lg border border-border bg-card p-4 shadow-sm transition-all",
                bloqueado ? "opacity-70 cursor-default" : "active:scale-[0.98]"
              )}
            >
              <div className="text-left">
                <p className="font-semibold text-foreground">{student.name}</p>
                <p className="text-xs text-muted-foreground">{student.class_name}</p>
              </div>
              <span className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold", config.className)}>
                <Icon className="h-3.5 w-3.5" />{config.label}
              </span>
            </button>
          );
        })}

        {filteredStudents.length === 0 && search && (
          <p className="py-8 text-center text-muted-foreground">Nenhum aluno encontrado para "{search}".</p>
        )}
        {students.length === 0 && (
          <p className="py-8 text-center text-muted-foreground">Nenhum aluno cadastrado. Cadastre alunos na aba "Alunos".</p>
        )}
      </div>

      {/* Botão salvar — só aparece se não bloqueado */}
      {students.length > 0 && !bloqueado && (
        <div className="fixed bottom-16 left-0 right-0 z-40 border-t border-border bg-card p-4 safe-bottom">
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="w-full h-12 text-base font-semibold"
          >
            {saveMutation.isPending ? "Salvando..." : jaRegistrada ? "Salvar Alterações" : "Salvar Chamada"}
          </Button>
        </div>
      )}
    </div>
  );
}
