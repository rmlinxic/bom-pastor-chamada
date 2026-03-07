import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import PageHeader from "@/components/PageHeader";
import { useAllAttendance } from "@/hooks/useAttendance";
import { useStudents } from "@/hooks/useStudents";

export default function Reports() {
  const { data: students = [] } = useStudents();
  const { data: attendance = [] } = useAllAttendance();

  const unjustifiedCounts: Record<string, number> = {};
  attendance.forEach((a) => {
    if (a.status === "falta_nao_justificada") {
      unjustifiedCounts[a.student_id] = (unjustifiedCounts[a.student_id] || 0) + 1;
    }
  });

  const statusLabels: Record<string, string> = {
    presente: "Presente",
    falta_justificada: "Falta Justificada",
    falta_nao_justificada: "Falta Não Justificada",
  };

  const statusColors: Record<string, string> = {
    presente: "text-success",
    falta_justificada: "text-warning",
    falta_nao_justificada: "text-destructive",
  };

  return (
    <div className="pb-24">
      <PageHeader title="Relatórios" subtitle="Histórico detalhado de presenças" />

      {students.filter((s) => (unjustifiedCounts[s.id] ?? 0) >= 3).length > 0 && (
        <div className="mx-4 mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <span className="font-semibold text-destructive">Alunos em Alerta (3+ faltas)</span>
          </div>
          <div className="space-y-1">
            {students
              .filter((s) => (unjustifiedCounts[s.id] ?? 0) >= 3)
              .map((s) => (
                <p key={s.id} className="text-sm text-destructive">
                  {s.name} — {unjustifiedCounts[s.id]} faltas não justificadas
                </p>
              ))}
          </div>
        </div>
      )}

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
            {attendance.map((a) => {
              const isAlert = (unjustifiedCounts[a.student_id] ?? 0) >= 3;
              return (
                <tr key={a.id} className={cn("border-b border-border", isAlert && "bg-destructive/5")}>
                  <td className="py-3 pr-2">
                    <div className="flex items-center gap-1.5">
                      {isAlert && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                      <span className={cn("font-medium", isAlert && "text-destructive")}>
                        {(a as any).students?.name ?? "—"}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 pr-2 text-muted-foreground">{a.date}</td>
                  <td className={cn("py-3 font-medium", statusColors[a.status])}>
                    {statusLabels[a.status] ?? a.status}
                  </td>
                </tr>
              );
            })}
            {attendance.length === 0 && (
              <tr>
                <td colSpan={3} className="py-8 text-center text-muted-foreground">
                  Nenhum registro de presença.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
