import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Check, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import PageHeader from "@/components/PageHeader";
import { useStudents } from "@/hooks/useStudents";
import { useAttendanceByDate, useSaveAttendance } from "@/hooks/useAttendance";

type Status = "presente" | "falta_justificada" | "falta_nao_justificada";

export default function Attendance() {
  const [date, setDate] = useState<Date>(new Date());
  const dateStr = format(date, "yyyy-MM-dd");
  const { data: students = [] } = useStudents();
  const { data: existingAttendance = [] } = useAttendanceByDate(dateStr);
  const saveMutation = useSaveAttendance();

  const [statuses, setStatuses] = useState<Record<string, Status>>({});

  // BUGFIX: resetar marcações manuais ao trocar de data
  useEffect(() => {
    setStatuses({});
  }, [dateStr]);

  const getStatus = (studentId: string): Status => {
    if (statuses[studentId]) return statuses[studentId];
    const existing = existingAttendance.find((a) => a.student_id === studentId);
    return (existing?.status as Status) ?? "presente";
  };

  const toggleStatus = (studentId: string) => {
    const current = getStatus(studentId);
    const next: Status =
      current === "presente"
        ? "falta_nao_justificada"
        : current === "falta_nao_justificada"
        ? "falta_justificada"
        : "presente";
    setStatuses((prev) => ({ ...prev, [studentId]: next }));
  };

  const handleSave = () => {
    const records = students.map((s) => ({
      student_id: s.id,
      date: dateStr,
      status: getStatus(s.id),
    }));
    saveMutation.mutate(records);
  };

  const statusConfig: Record<
    Status,
    { icon: typeof Check; label: string; className: string }
  > = {
    presente: {
      icon: Check,
      label: "Presente",
      className: "bg-success text-success-foreground",
    },
    falta_nao_justificada: {
      icon: X,
      label: "Falta",
      className: "bg-destructive text-destructive-foreground",
    },
    falta_justificada: {
      icon: AlertTriangle,
      label: "Justificada",
      className: "bg-warning text-warning-foreground",
    },
  };

  return (
    <div className="pb-24">
      <PageHeader title="Chamada" subtitle="Registre a presença dos catequizandos" />

      <div className="px-4 mb-4">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="w-full justify-start text-left font-normal"
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {format(date, "PPP", { locale: ptBR })}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={date}
              onSelect={(d) => d && setDate(d)}
              initialFocus
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Legenda */}
      <div className="px-4 mb-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span>Toque para alternar:</span>
        <span className="flex items-center gap-1">
          <Check className="h-3 w-3 text-success" /> Presente
        </span>
        <span className="flex items-center gap-1">
          <X className="h-3 w-3 text-destructive" /> Falta
        </span>
        <span className="flex items-center gap-1">
          <AlertTriangle className="h-3 w-3 text-warning" /> Justif.
        </span>
      </div>

      <div className="space-y-2 px-4">
        {students.map((student) => {
          const status = getStatus(student.id);
          const config = statusConfig[status];
          const Icon = config.icon;

          return (
            <button
              key={student.id}
              onClick={() => toggleStatus(student.id)}
              className="flex w-full items-center justify-between rounded-lg border border-border bg-card p-4 shadow-sm transition-all active:scale-[0.98]"
            >
              <div className="text-left">
                <p className="font-semibold text-foreground">{student.name}</p>
                <p className="text-xs text-muted-foreground">
                  {student.class_name}
                </p>
              </div>
              <span
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold",
                  config.className
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {config.label}
              </span>
            </button>
          );
        })}

        {students.length === 0 && (
          <p className="py-8 text-center text-muted-foreground">
            Nenhum aluno cadastrado. Cadastre alunos na aba "Alunos".
          </p>
        )}
      </div>

      {students.length > 0 && (
        <div className="fixed bottom-16 left-0 right-0 z-40 border-t border-border bg-card p-4 safe-bottom">
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="w-full h-12 text-base font-semibold"
          >
            {saveMutation.isPending ? "Salvando..." : "Salvar Chamada"}
          </Button>
        </div>
      )}
    </div>
  );
}
