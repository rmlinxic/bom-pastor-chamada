import { useState } from "react";
import { AlertTriangle, Download, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/PageHeader";
import { useAllAttendance, useDeleteAttendance } from "@/hooks/useAttendance";
import { useStudents } from "@/hooks/useStudents";

const STATUS_LABELS: Record<string, string> = {
  presente: "Presente",
  falta_justificada: "Falta Justificada",
  falta_nao_justificada: "Falta N\u00e3o Justificada",
};

const STATUS_COLORS: Record<string, string> = {
  presente: "text-success",
  falta_justificada: "text-warning",
  falta_nao_justificada: "text-destructive",
};

export default function Reports() {
  const { data: students = [] } = useStudents();
  const { data: attendance = [] } = useAllAttendance();
  const deleteMutation = useDeleteAttendance();
  const [selectedClass, setSelectedClass] = useState<string>("all");

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
          const aAny = a as any;
          const turma =
            students.find((s) => s.id === a.student_id)?.class_name ??
            aAny.students?.class_name;
          return turma === selectedClass;
        });

  const handleDelete = (id: string, studentName: string, date: string) => {
    if (
      window.confirm(
        `Apagar o registro de "${studentName}" no dia ${date}?\n\nEssa a\u00e7\u00e3o n\u00e3o pode ser desfeita.`
      )
    ) {
      deleteMutation.mutate(id);
    }
  };

  const handleExportCSV = () => {
    const allDates = [...new Set(filteredAttendance.map((a) => a.date))].sort();

    // Mapa de informa\u00e7\u00f5es dos alunos
    const studentMap: Record<string, { name: string; class_name: string }> = {};
    students.forEach((s) => { studentMap[s.id] = { name: s.name, class_name: s.class_name }; });
    filteredAttendance.forEach((a) => {
      if (!studentMap[a.student_id]) {
        const aAny = a as any;
        if (aAny.students?.name) {
          studentMap[a.student_id] = { name: aAny.students.name, class_name: aAny.students.class_name ?? "\u2014" };
        }
      }
    });

    // Lookup: studentId -> date -> { status, reason }
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

    const pad = (n: number) => Array(n).fill("");

    // === MATRIZ DE PRESEN\u00c7AS ===
    const header = ["Aluno", "Turma", ...allDates, "Presen\u00e7as", "Faltas NJ", "Faltas Justif.", "Total Aulas", "% Presen\u00e7a"];
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
    const extraCols = header.length - 2;

    // === SE\u00c7\u00c3O DE JUSTIFICATIVAS ===
    const justified = filteredAttendance.filter(
      (a) => a.status === "falta_justificada" && (a as any).justification_reason
    );
    const justRows = justified
      .map((a) => {
        const aAny = a as any;
        const name = aAny.students?.name ?? studentMap[a.student_id]?.name ?? "\u2014";
        const turma = aAny.students?.class_name ?? studentMap[a.student_id]?.class_name ?? "\u2014";
        return [name, turma, a.date, aAny.justification_reason ?? ""];
      })
      .sort((a, b) => String(a[2]).localeCompare(String(b[2])));

    // Monta todas as linhas do CSV
    const rows = [
      // Matriz principal
      header,
      ...dataRows,
      pad(header.length),
      // Resumo estatístico
      ["RESUMO GERAL", ...pad(header.length - 1)],
      ["Legenda: P = Presente | FJ = Falta Justificada | FN = Falta N\u00e3o Justificada", ...pad(header.length - 1)],
      pad(header.length),
      ["Total de alunos", relevantStudents.length, ...pad(extraCols)],
      ["Total de presen\u00e7as", sumP, ...pad(extraCols)],
      ["Total de faltas n\u00e3o justificadas", sumFNJ, ...pad(extraCols)],
      ["Total de faltas justificadas", sumFJ, ...pad(extraCols)],
      ["M\u00e9dia geral de presen\u00e7a", media, ...pad(extraCols)],
      // Se\u00e7\u00e3o de justificativas
      ...(justRows.length > 0
        ? [
            pad(header.length),
            ["MOTIVOS DAS JUSTIFICATIVAS", ...pad(header.length - 1)],
            ["Aluno", "Turma", "Data", "Motivo", ...pad(header.length - 4)],
            ...justRows.map((r) => [...r, ...pad(header.length - 4)]),
          ]
        : []),
    ];

    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `chamada-bom-pastor-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="pb-24">
      <PageHeader title="Relat\u00f3rios" subtitle="Hist\u00f3rico detalhado de presen\u00e7as" />

      {/* Alerta: alunos com 3+ faltas */}
      {students.filter((s) => (unjustifiedCounts[s.id] ?? 0) >= 3).length > 0 && (
        <div className="mx-4 mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <span className="font-semibold text-destructive">
              Alunos em Alerta (3+ faltas n\u00e3o justificadas)
            </span>
          </div>
          {students
            .filter((s) => (unjustifiedCounts[s.id] ?? 0) >= 3)
            .map((s) => (
              <p key={s.id} className="text-sm text-destructive">
                {s.name} \u2014 {unjustifiedCounts[s.id]} faltas
              </p>
            ))}
        </div>
      )}

      {/* Filtro por turma + exportar */}
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

      {/* Tabela */}
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
                "\u2014";
              const studentClass =
                aAny.students?.class_name ??
                students.find((s) => s.id === a.student_id)?.class_name ??
                "\u2014";
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
                        <span className={cn("font-medium", isAlert && "text-destructive")}>
                          {studentName}
                        </span>
                      </div>
                      {/* Motivo da justificativa inline na tabela */}
                      {a.status === "falta_justificada" && aAny.justification_reason && (
                        <span className="text-xs text-muted-foreground mt-0.5 pl-0.5">
                          "{aAny.justification_reason}"
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 pr-2 text-muted-foreground text-xs">
                    {studentClass}
                  </td>
                  <td className="py-3 pr-2 text-muted-foreground">{a.date}</td>
                  <td className={cn("py-3 font-medium", STATUS_COLORS[a.status])}>
                    {STATUS_LABELS[a.status] ?? a.status}
                  </td>
                  <td className="py-3">
                    <button
                      onClick={() => handleDelete(a.id, studentName, a.date)}
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
                <td colSpan={5} className="py-8 text-center text-muted-foreground">
                  Nenhum registro de presen\u00e7a.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
