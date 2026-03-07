import { Users, CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";

export default function Dashboard() {
  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [studentsRes, attendanceRes] = await Promise.all([
        supabase.from("students").select("id, name", { count: "exact" }).eq("active", true),
        supabase.from("attendance").select("*"),
      ]);

      const totalStudents = studentsRes.count ?? 0;
      const allStudents = studentsRes.data ?? [];
      const records = attendanceRes.data ?? [];
      const present = records.filter((r) => r.status === "presente").length;
      const justified = records.filter((r) => r.status === "falta_justificada").length;
      const unjustified = records.filter((r) => r.status === "falta_nao_justificada").length;

      // Alert: students with 3+ unjustified absences
      const unjustifiedCounts: Record<string, number> = {};
      records.forEach((r) => {
        if (r.status === "falta_nao_justificada") {
          unjustifiedCounts[r.student_id] = (unjustifiedCounts[r.student_id] || 0) + 1;
        }
      });
      const alertStudents = allStudents.filter((s) => (unjustifiedCounts[s.id] ?? 0) >= 3).map((s) => ({
        name: s.name,
        count: unjustifiedCounts[s.id],
      }));

      // Weekly chart
      const now = new Date();
      const weeks: { name: string; presença: number }[] = [];
      for (let i = 3; i >= 0; i--) {
        const weekEnd = new Date(now);
        weekEnd.setDate(now.getDate() - i * 7);
        const weekStart = new Date(weekEnd);
        weekStart.setDate(weekEnd.getDate() - 7);
        const count = records.filter((r) => {
          const d = new Date(r.date);
          return d >= weekStart && d <= weekEnd && r.status === "presente";
        }).length;
        weeks.push({ name: `Sem ${4 - i}`, presença: count });
      }

      return { totalStudents, present, justified, unjustified, weeks, alertStudents };
    },
  });

  return (
    <div className="pb-24">
      <PageHeader title="Catequese Bom Pastor" subtitle="Painel de controle de presença" />
      <div className="grid grid-cols-2 gap-3 px-4">
        <StatCard label="Total de Alunos" value={stats?.totalStudents ?? 0} icon={Users} />
        <StatCard label="Presenças" value={stats?.present ?? 0} icon={CheckCircle} variant="success" />
        <StatCard label="Faltas Justificadas" value={stats?.justified ?? 0} icon={AlertTriangle} variant="warning" />
        <StatCard label="Faltas Não Justificadas" value={stats?.unjustified ?? 0} icon={XCircle} variant="destructive" />
      </div>

      {/* Alert component */}
      {(stats?.alertStudents?.length ?? 0) > 0 && (
        <div className="mx-4 mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <span className="font-bold text-destructive">Alunos em Alerta</span>
          </div>
          <p className="text-xs text-muted-foreground mb-2">Alunos com 3 ou mais faltas não justificadas:</p>
          <div className="space-y-1">
            {stats!.alertStudents.map((s) => (
              <p key={s.name} className="text-sm font-medium text-destructive">
                {s.name} — {s.count} faltas
              </p>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 px-4">
        <h2 className="mb-3 text-lg font-semibold text-foreground">Frequência Semanal</h2>
        <div className="rounded-lg bg-card p-4 shadow-sm border border-border">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats?.weeks ?? []}>
              <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip />
              <Bar dataKey="presença" fill="hsl(213, 70%, 45%)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
