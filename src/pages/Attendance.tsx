import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Check, AlertTriangle, X, Search, Info, Edit2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import PageHeader from "@/components/PageHeader";
import { useStudents } from "@/hooks/useStudents";
import { useAttendanceByDate, useSaveAttendance, useUpdateAttendanceRecord } from "@/hooks/useAttendance";

type Status = "presente" | "falta_justificada" | "falta_nao_justificada";

const statusConfig: Record<Status, { icon: typeof Check; label: string; className: string }> = {
  presente: { icon: Check, label: "Presente", className: "bg-success text-success-foreground" },
  falta_nao_justificada: { icon: X, label: "Falta", className: "bg-destructive text-destructive-foreground" },
  falta_justificada: { icon: AlertTriangle, label: "Justificada", className: "bg-warning text-warning-foreground" },
};

type EditingRecord = {
  id: string;
  studentId: string;
  studentName: string;
  status: Status;
  justification: string;
};

export default function Attendance() {
  const [date, setDate] = useState<Date>(new Date());
  const dateStr = format(date, "yyyy-MM-dd");
  const { data: students = [] } = useStudents();
  const { data: existingAttendance = [] } = useAttendanceByDate(dateStr);
  const saveMutation = useSaveAttendance();
  const updateMutation = useUpdateAttendanceRecord();

  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [search, setSearch] = useState("");
  const [calOpen, setCalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<EditingRecord | null>(null);

  useEffect(() => { setStatuses({}); }, [dateStr]);

  const myStudentIds = useMemo(() => new Set(students.map((s) => s.id)), [students]);
  const myExistingAttendance = useMemo(
    () => existingAttendance.filter((a: any) => myStudentIds.has(a.student_id)),
    [existingAttendance, myStudentIds]
  );

  const jaRegistrada = myExistingAttendance.length > 0;
  const [editando, setEditando] = useState(false);
  useEffect(() => { setEditando(false); }, [dateStr]);

  const getStatus = (studentId: string): Status => {
    if (statuses[studentId]) return statuses[studentId];
    const existing = myExistingAttendance.find((a: any) => a.student_id === studentId);
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

  const openEditRecord = (student: any) => {
    const existing = myExistingAttendance.find((a: any) => a.student_id === student.id);
    if (!existing) return;
    setEditingRecord({
      id: (existing as any).id,
      studentId: student.id,
      studentName: student.name,
      status: (existing as any).status as Status,
      justification: (existing as any).justification_reason ?? "",
    });
  };

  const handleUpdateRecord = () => {
    if (!editingRecord) return;
    updateMutation.mutate(
      {
        id: editingRecord.id,
        status: editingRecord.status,
        justification_reason:
          editingRecord.status === "falta_justificada" ? editingRecord.justification : null,
      },
      { onSuccess: () => setEditingRecord(null) }
    );
  };

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => s.name.toLowerCase().includes(q));
  }, [students, search]);

  const bloqueado = jaRegistrada && !editando;

  const resumo = useMemo(() => {
    if (!jaRegistrada) return null;
    const p = myExistingAttendance.filter((a: any) => a.status === "presente").length;
    const f = myExistingAttendance.filter((a: any) => a.status === "falta_nao_justificada").length;
    const j = myExistingAttendance.filter((a: any) => a.status === "falta_justificada").length;
    return { p, f, j };
  }, [myExistingAttendance, jaRegistrada]);

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
              {editando ? "Modo de edição em lote — salve para confirmar" : "Chamada já registrada neste dia"}
            </p>
            {resumo && !editando && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {resumo.p} presente{resumo.p !== 1 ? "s" : ""} · {resumo.f} falta{resumo.f !== 1 ? "s" : ""} · {resumo.j} justificada{resumo.j !== 1 ? "s" : ""}
              </p>
            )}
            {!editando && (
              <p className="text-xs text-muted-foreground mt-1">
                Toque no ícone <Edit2 className="inline h-3 w-3" /> ao lado de um catequizando para editar o registro individualmente.
              </p>
            )}
          </div>
          {!editando && (
            <button
              onClick={() => setEditando(true)}
              className="shrink-0 text-xs font-semibold text-primary underline underline-offset-2 whitespace-nowrap"
            >
              Editar tudo
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
      {!bloqueado && (
        <div className="px-4 mb-3 flex items-center gap-4 text-xs text-muted-foreground">
          <span>Toque para alternar:</span>
          <span className="flex items-center gap-1"><Check className="h-3 w-3 text-success" /> Presente</span>
          <span className="flex items-center gap-1"><X className="h-3 w-3 text-destructive" /> Falta</span>
          <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-warning" /> Justificada</span>
        </div>
      )}

      {/* Lista */}
      <div className="space-y-2 px-4">
        {filteredStudents.map((student) => {
          const status = getStatus(student.id);
          const config = statusConfig[status];
          const Icon = config.icon;
          const hasRecord = myExistingAttendance.some((a: any) => a.student_id === student.id);
          return (
            <div
              key={student.id}
              className="flex w-full items-center gap-2"
            >
              <button
                onClick={() => !bloqueado && toggleStatus(student.id)}
                disabled={bloqueado}
                className={cn(
                  "flex flex-1 items-center justify-between rounded-lg border border-border bg-card p-4 shadow-sm transition-all",
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

              {/* Botão de edição individual — aparece só quando a chamada já foi registrada e não está no modo edição em lote */}
              {jaRegistrada && !editando && hasRecord && (
                <button
                  onClick={() => openEditRecord(student)}
                  className="shrink-0 p-2.5 rounded-lg border border-border bg-card shadow-sm text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
                  title="Editar registro deste catequizando"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
              )}
            </div>
          );
        })}

        {filteredStudents.length === 0 && search && (
          <p className="py-8 text-center text-muted-foreground">Nenhum catequizando encontrado para "{search}".</p>
        )}
        {students.length === 0 && (
          <p className="py-8 text-center text-muted-foreground">Nenhum catequizando cadastrado. Cadastre catequizandos na aba "Catequizandos".</p>
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

      {/* Modal: edição individual de registro */}
      {editingRecord && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-card border border-border shadow-xl p-5 space-y-4 animate-fade-in">
            <div>
              <p className="font-bold text-foreground text-base">{editingRecord.studentName}</p>
              <p className="text-xs text-muted-foreground">
                {format(date, "PPP", { locale: ptBR })}
              </p>
            </div>

            {/* Seletor de status */}
            <div className="space-y-1.5">
              <p className="text-sm font-semibold text-foreground">Status</p>
              <div className="grid grid-cols-3 gap-2">
                {(["presente", "falta_nao_justificada", "falta_justificada"] as Status[]).map((s) => {
                  const cfg = statusConfig[s];
                  const Icon = cfg.icon;
                  const isActive = editingRecord.status === s;
                  return (
                    <button
                      key={s}
                      onClick={() => setEditingRecord((prev) => prev ? { ...prev, status: s } : prev)}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-lg border p-3 text-xs font-semibold transition-all",
                        isActive
                          ? cn(cfg.className, "border-transparent")
                          : "border-border bg-muted/30 text-muted-foreground hover:border-primary/40"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Campo de justificativa — aparece se status for falta_justificada */}
            {editingRecord.status === "falta_justificada" && (
              <div className="space-y-1.5">
                <p className="text-sm font-semibold text-foreground">Motivo da justificativa</p>
                <Textarea
                  value={editingRecord.justification}
                  onChange={(e) =>
                    setEditingRecord((prev) => prev ? { ...prev, justification: e.target.value } : prev)
                  }
                  placeholder="Descreva o motivo da justificativa..."
                  rows={3}
                  maxLength={500}
                />
                <p className="text-xs text-muted-foreground text-right">{editingRecord.justification.length}/500</p>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setEditingRecord(null)}
                disabled={updateMutation.isPending}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1"
                onClick={handleUpdateRecord}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
