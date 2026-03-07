import { useState } from "react";
import { AlertTriangle, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/PageHeader";
import { useAllAttendance } from "@/hooks/useAttendance";
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
  const [selectedClass, setSelectedClass] = useState<string>("all");

  // Count unjustified absences per student
  const unjustifiedCounts: Record<string, number> = {};
  attendance.forEach((a) => {
    if (a.status === "falta_nao_justificada") {
      unjustifiedCounts[a.student_id] =
        (unjustifiedCounts[a.student_id] || 0) + 1;
    }
  });

  // Unique sorted class names for filter
  const classes = [
    "all",
    ...Array.from(new Set(students.map((s) => s.class_name))).sort(),
  ];

  // Filter attendance records by selected class
  const filteredAttendance =
    selectedClass === "all"
      ? attendance
      : attendance.filter((a) => {
          const student = students.find((s) => s.id === a.student_id);
          return student?.class_name === selectedClass;
        });

  // Export filtered data as UTF-8 CSV
  const handleExportCSV = () => {
    const rows = [
      ["Nome do Aluno", "Turma", "Data", "Status"],
      ...filteredAttendance.map((a) => {
        const student = students.find((s) => s.id === a.student_id);
        const aAny = a as any;
        return [
          student?.name ?? aAny.students?.name ?? "\u2014",
          student?.class_name ?? aAny.students?.class_name ?? "\u2014",
          a.date,
          STATUS_LABELS[a.status] ?? a.status,
        ];
      }),
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

      {/* Alert: students with 3+ unjustified absences */}
      {students.filter((s) => (unjustifiedCounts[s.id] ?? 0) >= 3).length >
        0 && (
        <div className="mx-4 mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <span className="font-semibold text-destructive">
              Alunos em Alerta (3+ faltas)
            </span>
          </div>
          <div className="space-y-1">
            {students
              .filter((s) => (unjustifiedCounts[s.id] ?? 0) >= 3)
              .map((s) => (
                <p key={s.id} className="text-sm text-destructive">
                  {s.name} \u2014 {unjustifiedCounts[s.id]} faltas n\u00e3o
                  justificadas
                </p>
              ))}
          </div>
        </div>
      )}

      {/* Filter tabs + CSV export button */}
      <div className="px-4 mb-4 flex items-center gap-3">
        <div className="flex gap-2 overflow-x-auto pb-1 flex-1 scrollbar-hide">
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

      {/* Attendance table */}
      <div className="px-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="pb-2 font-semibold text-foreground">Aluno</th>
              <th className="pb-2 font-semibold text-foreground">Data</th>
              <th className="pb-2 font-semibold text-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredAttendance.map((a) => {
              const isAlert = (unjustifiedCounts[a.student_id] ?? 0) >= 3;
              const aAny = a as any;
              return (
                <tr
                  key={a.id}
                  className={cn(
                    "border-b border-border",
                    isAlert && "bg-destructive/5"
                  )}
                >
                  <td className="py-3 pr-2">
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
                        {aAny.students?.name ?? "\u2014"}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 pr-2 text-muted-foreground">{a.date}</td>
                  <td
                    className={cn(
                      "py-3 font-medium",
                      STATUS_COLORS[a.status]
                    )}
                  >
                    {STATUS_LABELS[a.status] ?? a.status}
                  </td>
                </tr>
              );
            })}
            {filteredAttendance.length === 0 && (
              <tr>
                <td
                  colSpan={3}
                  className="py-8 text-center text-muted-foreground"
                >
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
