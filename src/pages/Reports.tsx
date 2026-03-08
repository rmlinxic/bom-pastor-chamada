import { useState } from "react";
import { AlertTriangle, Download, Trash2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/PageHeader";
import {
  useAllAttendance,
  useDeleteAttendance,
  usePendingJustifications,
  useDeletePendingJustification,
} from "@/hooks/useAttendance";
import { useStudents } from "@/hooks/useStudents";

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

type Tab = "presencas" | "pendentes";

export default function Reports() {
  const { data: students = [] } = useStudents();
  const { data: attendance = [] } = useAllAttendance();
  const { data: pendingList = [] } = usePendingJustifications();
  const deleteMutation = useDeleteAttendance();
  const deletePendingMutation = useDeletePendingJustification();
  const [selectedClass, setSelectedClass] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<Tab>("presencas");

  const unjustifiedCounts: Record<string, number> = {};
  attendance.forEach((a) => {
    if (a.status === "falta_nao_justificada") {
      unjustifiedCounts[a.student_id] =
        (unjustifiedCounts[a.student_id] || 0) + 1;
    }
  });

  const classes = [
    "all",
    ...Array.from(new Set(students.map((s) => s.class_name))).sort(),
  ];

  const filteredAttendance =
    selectedClass === "all"
      ? attendance
      : attendance.filter((a) => {
          const turma =
            students.find((s) => s.id === a.student_id)?.class_name ??
            (a as any).students?.class_name;
          return turma === selectedClass;
        });

  const filteredPending =
    selectedClass === "all"
      ? pendingList
      : pendingList.filter(
          (p) => p.students?.class_name === selectedClass
        );

  const handleDeleteAttendance = (id: string, studentName: string, date: string) => {
    if (
      window.confirm(
        `Apagar o registro de "${studentName}" no dia ${date}?\n\nEssa ação não pode ser desfeita.`
      )
    ) {
      deleteMutation.mutate(id);
    }
  };

  const handleDeletePending = (id: string, studentName: string, date: string) => {
    if (
      window.confirm(
        `Cancelar a justificativa pendente de "${studentName}" para o dia ${date}?`
      )
    ) {
      deletePendingMutation.mutate(id);
    }
  };

  const handleExportCSV = () => {
    const allDates = [...new Set(filteredAttendance.map((a) => a.date))].sort();

    const studentMap: Record<string, { name: string; class_name: string }> = {};
    students.forEach((s) => {
      studentMap[s.id] = { name: s.name, class_name: s.class_name };
    });
    filteredAttendance.forEach((a) => {
      if (!studentMap[a.student_id]) {
        const sAny = (a as any).students;
        if (sAny?.name) {
          studentMap[a.student_id] = {
            name: sAny.name,
            class_name: sAny.class_name ?? "-",
          };
        }
      }
    });

    const lookup: Record<string, Record<string, { status: string; reason: string }>> = {};
    filteredAttendance.forEach((a) => {
      if (!lookup[a.student_id]) lookup[a.student_id] = {};
      lookup[a.student_id][a.date] = {
        status: a.status,
        reason: (a as any).justification_reason ?? "",
      };
    });

    const SYM: Record<string, string> = {
      presente: "P",
      falta_justificada: "FJ",
      falta_nao_justificada: "FN",
    };

    const relevantStudents = Object.keys(lookup)
      .map((id) => ({ id, ...studentMap[id] }))
      .filter((s) => s.name)
      .sort((a, b) =>
        a.class_name !== b.class_name
          ? a.class_name.localeCompare(b.class_name)
          : a.name.localeCompare(b.name)
      );

    const pad = (n: number) => Array(Math.max(0, n)).fill("");

    const header = [
      "Aluno",
      "Turma",
      ...allDates,
      "Presenças",
      "Faltas NJ",
      "Faltas Justif.",
      "Total Aulas",
      "% Presença",
    ];

    let sumP = 0, sumFNJ = 0, sumFJ = 0, sumT = 0;

    const dataRows = relevantStudents.map((s) => {
      const rec = lookup[s.id] ?? {};
      const dateCells = allDates.map((d) => SYM[rec[d]?.status] ?? "-");
      const p = allDates.filter((d) => rec[d]?.status === "presente").length;
      const fnj = allDates.filter((d) => rec[d]?.status === "falta_nao_justificada").length;
      const fj = allDates.filter((d) => rec[d]?.status === "falta_justificada").length;
      const t = allDates.filter((d) => !!rec[d]).length;
      const pct = t > 0 ? `${((p / t) * 100).toFixed(1)}%` : "-";
      sumP += p; sumFNJ += fnj; sumFJ += fj; sumT += t;
      return [s.name, s.class_name, ...dateCells, p, fnj, fj, t, pct];
    });

    const media = sumT > 0 ? `${((sumP / sumT) * 100).toFixed(1)}%` : "-";
    const extra = header.length - 2;

    // Justificativas aplicadas
    const justApplied = filteredAttendance
      .filter((a) => a.status === "falta_justificada" && (a as any).justification_reason)
      .map((a) => {
        const sAny = (a as any).students;
        const name = sAny?.name ?? studentMap[a.student_id]?.name ?? "-";
        const turma = sAny?.class_name ?? studentMap[a.student_id]?.class_name ?? "-";
        return [name, turma, a.date, (a as any).justification_reason ?? ""];
      })
      .sort((a, b) => String(a[2]).localeCompare(String(b[2])));

    // Justificativas pendentes
    const justPending = filteredPending.map((p) => [
      p.students?.name ?? "-",
      p.students?.class_name ?? "-",
      p.date,
      p.reason,
      new Date(p.created_at).toLocaleString("pt-BR"),
    ]);

    const rows: (string | number)[][] = [
      header,
      ...dataRows,
      pad(header.length),
      ["RESUMO GERAL", ...pad(header.length - 1)],
      ["Legenda: P = Presente | FJ = Falta Justificada | FN = Falta Não Justificada", ...pad(header.length - 1)],
      pad(header.length),
      ["Total de alunos", relevantStudents.length, ...pad(extra)],
      ["Total de presenças", sumP, ...pad(extra)],
      ["Total de faltas não justificadas", sumFNJ, ...pad(extra)],
      ["Total de faltas justificadas", sumFJ, ...pad(extra)],
      ["Média geral de presença", media, ...pad(extra)],
    ];

    if (justApplied.length > 0) {
      rows.push(
        pad(header.length),
        ["MOTIVOS DAS JUSTIFICATIVAS APLICADAS", ...pad(header.length - 1)],
        ["Aluno", "Turma", "Data", "Motivo", ...pad(header.length - 4)],
        ...justApplied.map((r) => [...r, ...pad(header.length - 4)])
      );
    }

    if (justPending.length > 0) {
      rows.push(
        pad(header.length),
        ["JUSTIFICATIVAS PENDENTES (aguardando chamada)", ...pad(header.length - 1)],
        ["Aluno", "Turma", "Data", "Motivo", "Enviado em", ...pad(header.length - 5)],
        ...justPending.map((r) => [...r, ...pad(header.length - 5)])
      );
    }

    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `chamada-bom-pastor-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const alertStudents = students.filter(
    (s) => (unjustifiedCounts[s.id] ?? 0) >= 3
  );

  return (
    <div className="pb-24">
      <PageHeader
        title="Relatórios"
        subtitle="Histórico detalhado de presenças"
      />

      {/* Alerta: alunos com 3+ faltas */}
      {alertStudents.length > 0 && (
        <div className="mx-4 mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <span className="font-semibold text-destructive">
              Alunos em Alerta (3+ faltas não justificadas)
            </span>
          </div>
          {alertStudents.map((s) => (
            <p key={s.id} className="text-sm text-destructive">
              {s.name} — {unjustifiedCounts[s.id]} faltas
            </p>
          ))}
        </div>
      )}

      {/* Abas: Presenças | Pendentes */}
      <div className="px-4 mb-4 flex gap-2">
        <button
          onClick={() => setActiveTab("presencas")}
          className={cn(
            "flex-1 py-2.5 text-sm font-semibold rounded-lg border transition-colors",
            activeTab === "presencas"
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card text-muted-foreground border-border"
          )}
        >
          Presenças
        </button>
        <button
          onClick={() => setActiveTab("pendentes")}
          className={cn(
            "flex-1 py-2.5 text-sm font-semibold rounded-lg border transition-colors relative",
            activeTab === "pendentes"
              ? "bg-warning text-warning-foreground border-warning"
              : "bg-card text-muted-foreground border-border"
          )}
        >
          Pendentes
          {pendingList.length > 0 && (
            <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-warning text-[10px] font-bold text-warning-foreground border-2 border-background">
              {pendingList.length}
            </span>
          )}
        </button>
      </div>

      {/* Filtro por turma + exportar CSV */}
      <div className="px-4 mb-4 flex items-center gap-3">
        <div className="flex gap-2 overflow-x-auto pb-1 flex-1">
          {classes.map((c) => (
            <button
              key={c}
              onClick={() => setSelectedClass(c)}
              className={cn(
                "shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                selectedClass === c
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {c === "all" ? "Todas" : c}
            </button>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportCSV}
          className="shrink-0"
          disabled={filteredAttendance.length === 0}
        >
          <Download className="h-4 w-4 mr-1.5" />
          CSV
        </Button>
      </div>

      {/* ABA: PRESENÇAS */}
      {activeTab === "presencas" && (
        <div className="px-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="pb-2 font-semibold">Aluno</th>
                <th className="pb-2 font-semibold">Turma</th>
                <th className="pb-2 font-semibold">Data</th>
                <th className="pb-2 font-semibold">Status</th>
                <th className="pb-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {filteredAttendance.map((a) => {
                const aAny = a as any;
                const isAlert = (unjustifiedCounts[a.student_id] ?? 0) >= 3;
                const studentName =
                  aAny.students?.name ??
                  students.find((s) => s.id === a.student_id)?.name ??
                  "-";
                const studentClass =
                  aAny.students?.class_name ??
                  students.find((s) => s.id === a.student_id)?.class_name ??
                  "-";
                return (
                  <tr
                    key={a.id}
                    className={cn(
                      "border-b border-border group",
                      isAlert && "bg-destructive/5"
                    )}
                  >
                    <td className="py-3 pr-2">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                          {isAlert && (
                            <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
                          )}
                          <span
                            className={cn(
                              "font-medium",
                              isAlert && "text-destructive"
                            )}
                          >
                            {studentName}
                          </span>
                        </div>
                        {a.status === "falta_justificada" &&
                          aAny.justification_reason && (
                            <span className="text-xs text-muted-foreground mt-0.5 italic">
                              {aAny.justification_reason}
                            </span>
                          )}
                      </div>
                    </td>
                    <td className="py-3 pr-2 text-muted-foreground text-xs">
                      {studentClass}
                    </td>
                    <td className="py-3 pr-2 text-muted-foreground">
                      {a.date}
                    </td>
                    <td
                      className={cn(
                        "py-3 font-medium",
                        STATUS_COLORS[a.status]
                      )}
                    >
                      {STATUS_LABELS[a.status] ?? a.status}
                    </td>
                    <td className="py-3">
                      <button
                        onClick={() =>
                          handleDeleteAttendance(a.id, studentName, a.date)
                        }
                        disabled={deleteMutation.isPending}
                        className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                        title="Apagar registro"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredAttendance.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="py-8 text-center text-muted-foreground"
                  >
                    Nenhum registro de presença.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ABA: PENDENTES */}
      {activeTab === "pendentes" && (
        <div className="px-4 space-y-3">
          {filteredPending.length === 0 ? (
            <div className="py-10 text-center">
              <Clock className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-muted-foreground text-sm">
                Nenhuma justificativa pendente.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Quando os pais enviarem antes da chamada, aparecerão aqui.
              </p>
            </div>
          ) : (
            filteredPending.map((p) => (
              <div
                key={p.id}
                className="rounded-lg border border-warning/30 bg-warning/5 p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground">
                      {p.students?.name ?? "-"}
                    </p>
                    <p className="text-xs text-primary font-medium">
                      {p.students?.class_name ?? "-"}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Data da falta:{" "}
                      <span className="font-medium text-foreground">
                        {p.date}
                      </span>
                    </p>
                    <p className="text-sm mt-1">
                      <span className="text-muted-foreground">Motivo: </span>
                      <span className="text-foreground">{p.reason}</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Enviado em:{" "}
                      {new Date(p.created_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      handleDeletePending(
                        p.id,
                        p.students?.name ?? "-",
                        p.date
                      )
                    }
                    disabled={deletePendingMutation.isPending}
                    className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                    title="Cancelar justificativa"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
