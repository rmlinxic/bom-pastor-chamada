import { useState, useMemo } from "react";
import {
  AlertTriangle, Download, Trash2, Clock, Church,
  CheckCircle2, ChevronLeft, ChevronRight, FileText,
  Pencil, X, Check, CalendarDays,
} from "lucide-react";
import { format, getDaysInMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import PageHeader from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import {
  useAllAttendance, useDeleteAttendance,
  usePendingJustifications, useDeletePendingJustification,
  useUpdatePendingJustification,
} from "@/hooks/useAttendance";
import { useStudents } from "@/hooks/useStudents";
import { useMassAttendanceByMonth, useDeleteMassAttendance } from "@/hooks/useMassAttendance";
import { useAuth } from "@/contexts/AuthContext";

const db = supabase as any;

const STATUS_LABELS: Record<string, string> = {
  presente: "Presente",
  falta_justificada: "Falta Justificada",
  falta_nao_justificada: "Falta Não Justificada",
};
const STATUS_COLORS: Record<string, string> = {
  presente: "text-success",
  falta_justificada: "text-warning",
  falta_nao_justificada: "text-destructive",
};

type Tab = "presencas" | "pendentes" | "missas";

function todayMonthStr() { return new Date().toISOString().slice(0, 7); }
function shiftMonth(m: string, d: number) {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1 + d, 1).toISOString().slice(0, 7);
}
function monthLabel(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return format(new Date(y, mo - 1, 1), "MMMM yyyy", { locale: ptBR });
}

// ---- Formulário inline de edição de justificativa pendente ----
interface EditPendingProps {
  id: string;
  currentDate: string;
  currentReason: string;
  onCancel: () => void;
}
function EditPendingForm({ id, currentDate, currentReason, onCancel }: EditPendingProps) {
  const [date, setDate] = useState(currentDate);
  const [reason, setReason] = useState(currentReason);
  const updateMutation = useUpdatePendingJustification();

  const handleSave = () => {
    const clean = reason.trim().slice(0, 500);
    if (!clean || !date) return;
    updateMutation.mutate({ id, date, reason: clean }, { onSuccess: onCancel });
  };

  return (
    <div className="mt-3 space-y-3 border-t border-warning/30 pt-3">
      <div className="space-y-1">
        <p className="text-xs font-semibold text-muted-foreground">Nova data da falta</p>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <div className="space-y-1">
        <p className="text-xs font-semibold text-muted-foreground">Motivo</p>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={500}
          className="text-sm"
        />
        <p className="text-xs text-muted-foreground text-right">{reason.length}/500</p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="flex-1" onClick={onCancel} disabled={updateMutation.isPending}>
          <X className="h-3.5 w-3.5 mr-1" /> Cancelar
        </Button>
        <Button size="sm" className="flex-1" onClick={handleSave} disabled={updateMutation.isPending || !reason.trim() || !date}>
          <Check className="h-3.5 w-3.5 mr-1" />
          {updateMutation.isPending ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </div>
  );
}

export default function Reports() {
  const { isAdmin } = useAuth();
  const { data: students = [] } = useStudents();
  const { data: attendance = [] } = useAllAttendance();
  const { data: pendingList = [] } = usePendingJustifications();
  const deleteMutation = useDeleteAttendance();
  const deletePendingMutation = useDeletePendingJustification();
  const deleteMassMutation = useDeleteMassAttendance();

  const [selectedClass, setSelectedClass] = useState<string>("all");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [activeTab, setActiveTab] = useState<Tab>("presencas");
  const [massMonth, setMassMonth] = useState(todayMonthStr);
  const [selectedMassEtapa, setSelectedMassEtapa] = useState<string>("all");
  const [exportingAnnual, setExportingAnnual] = useState(false);
  const [editingPendingId, setEditingPendingId] = useState<string | null>(null);

  const etapas = useMemo(() => Array.from(new Set(students.map((s) => s.class_name))).sort(), [students]);

  const massFilteredStudents = useMemo(
    () => isAdmin && selectedMassEtapa !== "all" ? students.filter((s) => s.class_name === selectedMassEtapa) : students,
    [students, isAdmin, selectedMassEtapa]
  );
  const massStudentIds = useMemo(() => massFilteredStudents.map((s) => s.id), [massFilteredStudents]);
  const { data: massRecords = [] } = useMassAttendanceByMonth(massStudentIds, massMonth);

  const studentsWithMass = useMemo(() => new Set(massRecords.map((r) => r.student_id)), [massRecords]);
  const massCompliant = massFilteredStudents.filter((s) => studentsWithMass.has(s.id));
  const massNonCompliant = massFilteredStudents.filter((s) => !studentsWithMass.has(s.id));

  const today = new Date();
  const thisMonth = todayMonthStr();
  const isMassCurrentMonth = massMonth === thisMonth;
  const isMassPastMonth = massMonth < thisMonth;
  const daysLeft = getDaysInMonth(today) - today.getDate();
  const endOfMonthAlert = isMassCurrentMonth && daysLeft <= 7 && massNonCompliant.length > 0;

  const unjustifiedCounts: Record<string, number> = {};
  attendance.forEach((a) => {
    if (a.status === "falta_nao_justificada")
      unjustifiedCounts[a.student_id] = (unjustifiedCounts[a.student_id] || 0) + 1;
  });

  const classes = ["all", ...Array.from(new Set(students.map((s) => s.class_name))).sort()];

  // Filtro por turma
  const byClassAttendance = selectedClass === "all" ? attendance
    : attendance.filter((a) => {
        const turma = students.find((s) => s.id === a.student_id)?.class_name ?? (a as any).students?.class_name;
        return turma === selectedClass;
      });

  // Filtro adicional por data específica
  const filteredAttendance = selectedDate
    ? byClassAttendance.filter((a) => a.date === selectedDate)
    : byClassAttendance;

  const filteredPending = selectedClass === "all" ? pendingList
    : pendingList.filter((p) => p.students?.class_name === selectedClass);

  const alertStudents = students.filter((s) => (unjustifiedCounts[s.id] ?? 0) >= 3);

  // Datas disponíveis para o seletor (apenas datas que têm registros na turma selecionada)
  const availableDates = useMemo(
    () => [...new Set(byClassAttendance.map((a) => a.date))].sort().reverse(),
    [byClassAttendance]
  );

  const dateLabel = selectedDate
    ? format(new Date(selectedDate + "T12:00:00"), "dd/MM/yyyy (EEEE)", { locale: ptBR })
    : "";

  function downloadCSV(rows: (string | number)[][], filename: string) {
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = filename; link.click();
    URL.revokeObjectURL(url);
  }

  function handleDeleteAttendance(id: string, name: string, date: string) {
    if (window.confirm(`Apagar o registro de "${name}" no dia ${date}?\nEssa ação não pode ser desfeita.`))
      deleteMutation.mutate(id);
  }
  function handleDeletePending(id: string, name: string, date: string) {
    if (window.confirm(`Cancelar a justificativa pendente de "${name}" para o dia ${date}?`))
      deletePendingMutation.mutate(id);
  }
  function handleDeleteMass(id: string, name: string, date: string) {
    if (window.confirm(`Remover presença de "${name}" em ${date}?`))
      deleteMassMutation.mutate(id);
  }

  function handleExportCSV() {
    const allDates = [...new Set(filteredAttendance.map((a) => a.date))].sort();
    const studentMap: Record<string, { name: string; class_name: string }> = {};
    students.forEach((s) => { studentMap[s.id] = { name: s.name, class_name: s.class_name }; });
    filteredAttendance.forEach((a) => {
      if (!studentMap[a.student_id]) {
        const sAny = (a as any).students;
        if (sAny?.name) studentMap[a.student_id] = { name: sAny.name, class_name: sAny.class_name ?? "-" };
      }
    });
    const lookup: Record<string, Record<string, string>> = {};
    filteredAttendance.forEach((a) => {
      if (!lookup[a.student_id]) lookup[a.student_id] = {};
      lookup[a.student_id][a.date] = a.status;
    });
    const SYM: Record<string, string> = { presente: "P", falta_justificada: "FJ", falta_nao_justificada: "FN" };
    const rel = Object.keys(lookup).map((id) => ({ id, ...studentMap[id] })).filter((s) => s.name)
      .sort((a, b) => a.class_name !== b.class_name ? a.class_name.localeCompare(b.class_name) : a.name.localeCompare(b.name));
    const pad = (n: number) => Array(Math.max(0, n)).fill("");
    const header = ["Aluno", "Turma", ...allDates, "Presenças", "Faltas NJ", "Faltas Justif.", "Total Aulas", "% Presença"];
    let sumP = 0, sumFNJ = 0, sumFJ = 0, sumT = 0;
    const dataRows = rel.map((s) => {
      const rec = lookup[s.id] ?? {};
      const p = allDates.filter((d) => rec[d] === "presente").length;
      const fnj = allDates.filter((d) => rec[d] === "falta_nao_justificada").length;
      const fj = allDates.filter((d) => rec[d] === "falta_justificada").length;
      const t = allDates.filter((d) => !!rec[d]).length;
      sumP += p; sumFNJ += fnj; sumFJ += fj; sumT += t;
      return [s.name, s.class_name, ...allDates.map((d) => SYM[rec[d]] ?? "-"), p, fnj, fj, t, t > 0 ? `${((p / t) * 100).toFixed(1)}%` : "-"];
    });
    const extra = header.length - 2;
    const rows: (string | number)[][] = [header, ...dataRows, pad(header.length),
      ["RESUMO", ...pad(header.length - 1)], pad(header.length),
      ["Total de alunos", rel.length, ...pad(extra)],
      ["Total de presenças", sumP, ...pad(extra)],
      ["Faltas não justificadas", sumFNJ, ...pad(extra)],
      ["Faltas justificadas", sumFJ, ...pad(extra)],
      ["Média geral", sumT > 0 ? `${((sumP / sumT) * 100).toFixed(1)}%` : "-", ...pad(extra)],
    ];
    downloadCSV(rows, `chamada-bom-pastor-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  function handleExportPDF() {
    const turmaLabel = selectedClass === "all" ? "Todas as turmas" : selectedClass;
    const allDates = [...new Set(filteredAttendance.map((a) => a.date))].sort();
    const studentMap: Record<string, { name: string; class_name: string }> = {};
    students.forEach((s) => { studentMap[s.id] = { name: s.name, class_name: s.class_name }; });
    filteredAttendance.forEach((a) => {
      const sAny = (a as any).students;
      if (!studentMap[a.student_id] && sAny?.name)
        studentMap[a.student_id] = { name: sAny.name, class_name: sAny.class_name ?? "-" };
    });
    const lookup: Record<string, Record<string, string>> = {};
    filteredAttendance.forEach((a) => {
      if (!lookup[a.student_id]) lookup[a.student_id] = {};
      lookup[a.student_id][a.date] = a.status;
    });
    const SYM: Record<string, string> = { presente: "P", falta_justificada: "FJ", falta_nao_justificada: "FN" };
    const SYM_COLOR: Record<string, string> = { P: "#16a34a", FJ: "#d97706", FN: "#dc2626" };
    const rel = Object.keys(lookup).map((id) => ({ id, ...studentMap[id] })).filter((s) => s.name)
      .sort((a, b) => a.class_name !== b.class_name ? a.class_name.localeCompare(b.class_name) : a.name.localeCompare(b.name));
    const dateHeaders = allDates.map((d) => `<th style="padding:4px 6px;border:1px solid #e2e8f0;font-size:10px;white-space:nowrap">${d.slice(5)}</th>`).join("");
    const rows = rel.map((s) => {
      const rec = lookup[s.id] ?? {};
      const cells = allDates.map((d) => {
        const sym = SYM[rec[d]] ?? "-";
        const color = SYM_COLOR[sym] ?? "#64748b";
        return `<td style="padding:4px 6px;border:1px solid #e2e8f0;text-align:center;font-size:11px;color:${color};font-weight:600">${sym}</td>`;
      }).join("");
      const p = allDates.filter((d) => rec[d] === "presente").length;
      const t = allDates.filter((d) => !!rec[d]).length;
      const pct = t > 0 ? `${((p / t) * 100).toFixed(0)}%` : "-";
      const pctColor = t > 0 && (p / t) >= 0.75 ? "#16a34a" : t > 0 && (p / t) >= 0.5 ? "#d97706" : "#dc2626";
      return `<tr>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;font-size:12px;white-space:nowrap">${s.name}</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;font-size:11px;color:#64748b">${s.class_name}</td>
        ${cells}
        <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:center;font-size:12px;font-weight:700;color:${pctColor}">${pct}</td>
      </tr>`;
    }).join("");
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Relatório de Presenças — ${turmaLabel}</title>
<style>body{font-family:Arial,sans-serif;color:#1e293b;padding:20px}h1{font-size:18px;margin-bottom:2px}p{font-size:12px;color:#64748b;margin:2px 0 12px}table{border-collapse:collapse;width:100%}th{background:#f1f5f9;padding:6px 8px;border:1px solid #e2e8f0;font-size:11px;text-align:left}@media print{button{display:none}}</style>
</head><body>
<h1>Relatório de Presenças — Catequese Bom Pastor</h1>
<p>Turma: <strong>${turmaLabel}</strong> &nbsp;|&nbsp; Gerado em: ${new Date().toLocaleString("pt-BR")}</p>
<p style="margin-bottom:8px"><strong>Legenda:</strong> P = Presente &nbsp; FJ = Falta Justificada &nbsp; FN = Falta Não Justificada</p>
<table><thead><tr>
  <th>Aluno</th><th>Turma</th>${dateHeaders}<th style="padding:4px 6px;border:1px solid #e2e8f0">% Pres.</th>
</tr></thead><tbody>${rows}</tbody></table>
<br><button onclick="window.print()">Imprimir / Salvar PDF</button>
</body></html>`;
    const win = window.open("", "_blank");
    if (win) { win.document.write(html); win.document.close(); }
  }

  function handleExportMassCSV() {
    const etapaLabel = isAdmin && selectedMassEtapa !== "all" ? ` (${selectedMassEtapa})` : "";
    const mLabel = monthLabel(massMonth);
    const massDatesByStudent: Record<string, string[]> = {};
    massRecords.forEach((r) => {
      if (!massDatesByStudent[r.student_id]) massDatesByStudent[r.student_id] = [];
      massDatesByStudent[r.student_id].push(format(new Date(r.date + "T12:00:00"), "dd/MM/yyyy (EEE)", { locale: ptBR }));
    });
    const sorted = [...massNonCompliant.sort((a, b) => a.name.localeCompare(b.name)), ...massCompliant.sort((a, b) => a.name.localeCompare(b.name))];
    const rows: (string | number)[][] = [
      [`RELATÓRIO DE MISSAS — ${mLabel.toUpperCase()}${etapaLabel.toUpperCase()}`],
      ["Regra: mínimo 1 missa por mês"],
      [`Gerado em: ${new Date().toLocaleString("pt-BR", { dateStyle: "full", timeStyle: "short" })}`],
      [], ["Aluno", "Etapa", "Qtd. Missas", "Datas no Mês", "Conformidade"],
    ];
    sorted.forEach((s) => {
      const dates = massDatesByStudent[s.id] ?? [];
      rows.push([s.name, s.class_name, dates.length, dates.join(" | "), dates.length >= 1 ? "✓ Conforme" : "✗ Pendente"]);
    });
    const rate = massFilteredStudents.length > 0 ? `${((massCompliant.length / massFilteredStudents.length) * 100).toFixed(1)}%` : "-";
    rows.push([], ["RESUMO"], ["Total de alunos", massFilteredStudents.length], ["Conformes", massCompliant.length], ["Pendentes", massNonCompliant.length], ["Taxa", rate]);
    const suffix = isAdmin && selectedMassEtapa !== "all" ? `-${selectedMassEtapa.replace(/\s+/g, "-")}` : "";
    downloadCSV(rows, `missas-bom-pastor-${massMonth}${suffix}.csv`);
  }

  async function handleExportAnnualMassCSV() {
    if (exportingAnnual || massStudentIds.length === 0) return;
    setExportingAnnual(true);
    try {
      const year = new Date().getFullYear();
      const { data: allRecords } = await db.from("mass_attendance").select("student_id, date")
        .in("student_id", massStudentIds).gte("date", `${year}-01-01`).lte("date", `${year}-12-31`);
      const monthsAttended: Record<string, Set<string>> = {};
      (allRecords ?? []).forEach((r: any) => {
        if (!monthsAttended[r.student_id]) monthsAttended[r.student_id] = new Set();
        monthsAttended[r.student_id].add(r.date.slice(0, 7));
      });
      const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
      const monthNames = months.map((m) => { const [y, mo] = m.split("-").map(Number); return format(new Date(y, mo - 1, 1), "MMM", { locale: ptBR }).toUpperCase(); });
      const sorted = [...massFilteredStudents].sort((a, b) => a.name.localeCompare(b.name));
      const etapaLabel = isAdmin && selectedMassEtapa !== "all" ? ` — ${selectedMassEtapa}` : "";
      const rows: (string | number)[][] = [
        [`RELATÓRIO ANUAL DE MISSAS — ${year}${etapaLabel}`],
        ["Regra: mínimo 1 missa por mês  |✓ = conforme  |✗ = sem registro"],
        [`Gerado em: ${new Date().toLocaleString("pt-BR", { dateStyle: "full", timeStyle: "short" })}`],
        [], ["Aluno", "Etapa", ...monthNames, "Total"],
      ];
      sorted.forEach((s) => {
        const attended = monthsAttended[s.id] ?? new Set();
        const cells = months.map((m) => attended.has(m) ? "✓" : "✗");
        rows.push([s.name, s.class_name, ...cells, `${cells.filter((c) => c === "✓").length}/12`]);
      });
      const conformesPerMonth = months.map((m) => sorted.filter((s) => (monthsAttended[s.id] ?? new Set()).has(m)).length);
      rows.push([], ["Conformes no mês", "", ...conformesPerMonth, ""],
        ["% Conformidade", "", ...conformesPerMonth.map((n) => sorted.length > 0 ? `${((n / sorted.length) * 100).toFixed(0)}%` : "-"), ""]);
      const suffix = isAdmin && selectedMassEtapa !== "all" ? `-${selectedMassEtapa.replace(/\s+/g, "-")}` : "";
      downloadCSV(rows, `missas-anual-${year}${suffix}.csv`);
    } finally { setExportingAnnual(false); }
  }

  return (
    <div className="pb-24">
      <PageHeader title="Relatórios" subtitle="Histórico detalhado de presenças" />

      {alertStudents.length > 0 && (
        <div className="mx-4 mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <span className="font-semibold text-destructive">Alunos em Alerta (3+ faltas não justificadas)</span>
          </div>
          {alertStudents.map((s) => (<p key={s.id} className="text-sm text-destructive">{s.name} — {unjustifiedCounts[s.id]} faltas</p>))}
        </div>
      )}

      <div className="px-4 mb-4 flex gap-2">
        {(["presencas", "pendentes", "missas"] as Tab[]).map((tab) => {
          const labels: Record<Tab, string> = { presencas: "Presenças", pendentes: "Pendentes", missas: "Missas" };
          const badge = tab === "pendentes" ? pendingList.length : tab === "missas" && isMassCurrentMonth ? massNonCompliant.length : 0;
          return (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={cn("flex-1 py-2.5 text-sm font-semibold rounded-lg border transition-colors relative",
                activeTab === tab ? (tab === "pendentes" ? "bg-warning text-warning-foreground border-warning" : "bg-primary text-primary-foreground border-primary") : "bg-card text-muted-foreground border-border"
              )}
            >
              {labels[tab]}
              {badge > 0 && (<span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-warning text-[10px] font-bold text-warning-foreground border-2 border-background">{badge}</span>)}
            </button>
          );
        })}
      </div>

      {activeTab !== "missas" && (
        <div className="px-4 mb-4 flex items-center gap-3">
          <div className="flex gap-2 overflow-x-auto pb-1 flex-1">
            {classes.map((c) => (
              <button key={c} onClick={() => setSelectedClass(c)}
                className={cn("shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                  selectedClass === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >{c === "all" ? "Todas" : c}</button>
            ))}
          </div>
          {activeTab === "presencas" && (
            <div className="flex gap-1.5 shrink-0">
              <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={filteredAttendance.length === 0} title="Exportar CSV">
                <Download className="h-4 w-4 mr-1" /> CSV
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={filteredAttendance.length === 0} title="Exportar PDF">
                <FileText className="h-4 w-4 mr-1" /> PDF
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Filtro de data — apenas na aba Presenças */}
      {activeTab === "presencas" && (
        <div className="px-4 mb-4">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
                Filtrar por data
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Todas as datas</option>
                  {availableDates.map((d) => (
                    <option key={d} value={d}>
                      {format(new Date(d + "T12:00:00"), "dd/MM/yyyy (EEE)", { locale: ptBR })}
                    </option>
                  ))}
                </select>
                {selectedDate && (
                  <button
                    onClick={() => setSelectedDate("")}
                    className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    title="Limpar filtro de data"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            {selectedDate && (
              <div className="shrink-0 text-right">
                <span className="text-xs font-semibold text-primary">
                  {filteredAttendance.length} registro{filteredAttendance.length !== 1 ? "s" : ""}
                </span>
              </div>
            )}
          </div>
          {selectedDate && (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <span>Exibindo chamada de</span>
              <span className="font-semibold text-foreground capitalize">{dateLabel}</span>
              <span>—</span>
              <span className="text-success font-medium">
                {filteredAttendance.filter((a) => a.status === "presente").length} presentes
              </span>
              <span className="text-destructive font-medium">
                {filteredAttendance.filter((a) => a.status === "falta_nao_justificada").length} faltaram
              </span>
            </div>
          )}
        </div>
      )}

      {activeTab === "presencas" && (
        <div className="px-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="pb-2 font-semibold">Aluno</th>
                <th className="pb-2 font-semibold">Turma</th>
                {!selectedDate && <th className="pb-2 font-semibold">Data</th>}
                <th className="pb-2 font-semibold">Status</th>
                <th className="pb-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {filteredAttendance.map((a) => {
                const aAny = a as any;
                const isAlert = (unjustifiedCounts[a.student_id] ?? 0) >= 3;
                const studentName = aAny.students?.name ?? students.find((s) => s.id === a.student_id)?.name ?? "-";
                const studentClass = aAny.students?.class_name ?? students.find((s) => s.id === a.student_id)?.class_name ?? "-";
                return (
                  <tr key={a.id} className={cn("border-b border-border group", isAlert && "bg-destructive/5")}>
                    <td className="py-3 pr-2">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                          {isAlert && <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />}
                          <span className={cn("font-medium", isAlert && "text-destructive")}>{studentName}</span>
                        </div>
                        {a.status === "falta_justificada" && aAny.justification_reason && (
                          <span className="text-xs text-muted-foreground mt-0.5 italic">{aAny.justification_reason}</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 pr-2 text-muted-foreground text-xs">{studentClass}</td>
                    {!selectedDate && <td className="py-3 pr-2 text-muted-foreground">{a.date}</td>}
                    <td className={cn("py-3 font-medium", STATUS_COLORS[a.status])}>{STATUS_LABELS[a.status] ?? a.status}</td>
                    <td className="py-3">
                      <button onClick={() => handleDeleteAttendance(a.id, studentName, a.date)} disabled={deleteMutation.isPending}
                        className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredAttendance.length === 0 && (
                <tr>
                  <td colSpan={selectedDate ? 4 : 5} className="py-8 text-center text-muted-foreground">
                    {selectedDate ? `Nenhum registro para ${dateLabel}.` : "Nenhum registro de presença."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "pendentes" && (
        <div className="px-4 space-y-3">
          {filteredPending.length === 0 ? (
            <div className="py-10 text-center">
              <Clock className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-muted-foreground text-sm">Nenhuma justificativa pendente.</p>
              <p className="text-xs text-muted-foreground mt-1">Quando os pais enviarem antes da chamada, aparecerão aqui.</p>
            </div>
          ) : (
            filteredPending.map((p) => (
              <div key={p.id} className={cn(
                "rounded-lg border p-4",
                editingPendingId === p.id ? "border-primary/40 bg-primary/5" : "border-warning/30 bg-warning/5"
              )}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold">{p.students?.name ?? "-"}</p>
                    <p className="text-xs text-primary font-medium">{p.students?.class_name ?? "-"}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Data da falta: <span className="font-medium text-foreground">{p.date}</span>
                    </p>
                    <p className="text-sm mt-1"><span className="text-muted-foreground">Motivo: </span>{p.reason}</p>
                    <p className="text-xs text-muted-foreground mt-1">Enviado em: {new Date(p.created_at).toLocaleString("pt-BR")}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {editingPendingId !== p.id && (
                      <button
                        onClick={() => setEditingPendingId(p.id)}
                        className="p-1.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                        title="Editar justificativa"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDeletePending(p.id, p.students?.name ?? "-", p.date)}
                      disabled={deletePendingMutation.isPending}
                      className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {editingPendingId === p.id && (
                  <EditPendingForm
                    id={p.id}
                    currentDate={p.date}
                    currentReason={p.reason}
                    onCancel={() => setEditingPendingId(null)}
                  />
                )}
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === "missas" && (
        <div className="px-4">
          {isAdmin && etapas.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Filtrar por etapa</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                <button onClick={() => setSelectedMassEtapa("all")}
                  className={cn("shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors", selectedMassEtapa === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80")}
                >Todas</button>
                {etapas.map((e) => (
                  <button key={e} onClick={() => setSelectedMassEtapa(e)}
                    className={cn("shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors", selectedMassEtapa === e ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80")}
                  >{e}</button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mb-1">
            <Button variant="ghost" size="icon" onClick={() => setMassMonth(shiftMonth(massMonth, -1))}><ChevronLeft className="h-5 w-5" /></Button>
            <div className="text-center flex-1">
              <p className="font-semibold text-foreground capitalize">{monthLabel(massMonth)}</p>
              <p className="text-xs text-muted-foreground">{massCompliant.length}/{massFilteredStudents.length} com missa</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setMassMonth(shiftMonth(massMonth, 1))} disabled={isMassCurrentMonth}><ChevronRight className="h-5 w-5" /></Button>
          </div>

          <div className="flex gap-2 mb-4 justify-center">
            <Button variant="outline" size="sm" onClick={handleExportMassCSV} disabled={massFilteredStudents.length === 0} className="flex-1 max-w-[160px]">
              <Download className="h-4 w-4 mr-1.5" /> Mensal
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportAnnualMassCSV} disabled={massFilteredStudents.length === 0 || exportingAnnual} className="flex-1 max-w-[160px]">
              <Download className="h-4 w-4 mr-1.5" />{exportingAnnual ? "Gerando..." : "Anual"}
            </Button>
          </div>

          {endOfMonthAlert && (
            <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <p className="text-sm font-semibold text-destructive">Faltam {daysLeft} dia{daysLeft !== 1 ? "s" : ""} — {massNonCompliant.length} aluno{massNonCompliant.length !== 1 ? "s" : ""} sem missa.</p>
              </div>
            </div>
          )}

          {massFilteredStudents.length === 0 && (
            <div className="py-10 text-center">
              <Church className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-muted-foreground text-sm">Nenhum aluno para a etapa selecionada.</p>
            </div>
          )}

          {massNonCompliant.length > 0 && (
            <div className="mb-4 rounded-lg border border-warning/30 bg-warning/5 p-4">
              <p className="text-sm font-semibold text-warning mb-2">Sem registro neste mês ({massNonCompliant.length})</p>
              <div className="space-y-1">
                {massNonCompliant.sort((a, b) => a.name.localeCompare(b.name)).map((s) => (
                  <div key={s.id} className="flex items-center gap-2 text-sm">
                    <Clock className="h-3.5 w-3.5 text-warning shrink-0" />
                    <span className="text-warning font-medium">{s.name}</span>
                    {isMassPastMonth && <span className="text-xs text-destructive font-semibold ml-auto">Mês encerrado</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            {massCompliant.sort((a, b) => a.name.localeCompare(b.name)).map((s) => {
              const recs = massRecords.filter((r) => r.student_id === s.id);
              return (
                <div key={s.id} className="rounded-lg border border-success/30 bg-success/5 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                    <p className="font-semibold text-foreground flex-1">{s.name}</p>
                    <span className="text-xs bg-success/20 text-success rounded-full px-2 py-0.5 font-medium">{recs.length}×</span>
                  </div>
                  <div className="pl-6 space-y-0.5">
                    {recs.map((r) => (
                      <div key={r.id} className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{format(new Date(r.date + "T12:00:00"), "dd/MM/yyyy (EEE)", { locale: ptBR })}</span>
                        <button onClick={() => handleDeleteMass(r.id, s.name, r.date)} disabled={deleteMassMutation.isPending}
                          className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-5 rounded-lg bg-muted/40 border border-border p-3">
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">Regra:</strong> mínimo <strong>1 missa por mês</strong>.
              <strong> Mensal</strong> exporta o mês selecionado.
              <strong> Anual</strong> exporta a matriz completa do ano corrente.
              {isAdmin && " O filtro de etapa é aplicado em ambas as exportações."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
