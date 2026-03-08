import {
  Clock,
  Users,
  CheckCircle,
  AlertTriangle,
  XCircle,
  BookOpen,
  Church,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getDaysInMonth } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import { useNavigate } from "react-router-dom";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

const db = supabase as any;

function todayMonthStr() {
  return new Date().toISOString().slice(0, 7);
}

function lastDayOfMonth(monthStr: string) {
  const [y, m] = monthStr.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats", user?.id, user?.etapa],
    queryFn: async () => {
      // 1. Alunos filtrados por etapa (admin vê todos)
      let studentsQuery = supabase
        .from("students")
        .select("id, name", { count: "exact" })
        .eq("active", true);
      if (!isAdmin && user?.etapa) {
        studentsQuery = studentsQuery.eq("class_name", user.etapa);
      }
      const studentsRes = await studentsQuery;
      const totalStudents = studentsRes.count ?? 0;
      const allStudents = studentsRes.data ?? [];
      const studentIds = allStudents.map((s) => s.id);

      if (!isAdmin && studentIds.length === 0) {
        const weeks = Array.from({ length: 4 }, (_, i) => ({
          name: `Sem ${i + 1}`,
          presenca: 0,
        }));
        return {
          totalStudents: 0,
          present: 0,
          justified: 0,
          unjustified: 0,
          weeks,
          alertStudents: [],
          pendingList: [],
          studentsWithoutMass: [],
          massEndOfMonthAlert: false,
          daysLeftInMonth: 0,
        };
      }

      // 2. Presenças
      let attendanceQuery = supabase.from("attendance").select("*");
      if (!isAdmin) attendanceQuery = attendanceQuery.in("student_id", studentIds);
      const attendanceRes = await attendanceQuery;
      const records = attendanceRes.data ?? [];

      // 3. Justificativas pendentes
      let pendingQuery = db
        .from("pending_justifications")
        .select("id, date, students(name)");
      if (!isAdmin) pendingQuery = pendingQuery.in("student_id", studentIds);
      const pendingRes = await pendingQuery;
      const pendingList: { id: string; date: string; students: { name: string } }[] =
        pendingRes.data ?? [];

      // 4. Missas do mês atual
      const month = todayMonthStr();
      const lastDay = lastDayOfMonth(month);
      let massQuery = db
        .from("mass_attendance")
        .select("student_id")
        .gte("date", `${month}-01`)
        .lte("date", `${month}-${String(lastDay).padStart(2, "0")}`);
      if (!isAdmin) massQuery = massQuery.in("student_id", studentIds);
      const massRes = await massQuery;
      const studentsWithMassSet = new Set(
        (massRes.data ?? []).map((r: any) => r.student_id)
      );
      const studentsWithoutMass = allStudents.filter(
        (s) => !studentsWithMassSet.has(s.id)
      );

      const today = new Date();
      const daysLeftInMonth = getDaysInMonth(today) - today.getDate();
      const massEndOfMonthAlert =
        daysLeftInMonth <= 7 && studentsWithoutMass.length > 0;

      // 5. Estatísticas de presença
      const present = records.filter((r) => r.status === "presente").length;
      const justified = records.filter(
        (r) => r.status === "falta_justificada"
      ).length;
      const unjustified = records.filter(
        (r) => r.status === "falta_nao_justificada"
      ).length;

      const unjustifiedCounts: Record<string, number> = {};
      records.forEach((r) => {
        if (r.status === "falta_nao_justificada") {
          unjustifiedCounts[r.student_id] =
            (unjustifiedCounts[r.student_id] || 0) + 1;
        }
      });
      const alertStudents = allStudents
        .filter((s) => (unjustifiedCounts[s.id] ?? 0) >= 3)
        .map((s) => ({ name: s.name, count: unjustifiedCounts[s.id] }));

      // 6. Gráfico semanal
      const weeks: { name: string; presenca: number }[] = [];
      for (let i = 3; i >= 0; i--) {
        const weekEnd = new Date(today);
        weekEnd.setDate(today.getDate() - i * 7);
        const weekStart = new Date(weekEnd);
        weekStart.setDate(weekEnd.getDate() - 7);
        const count = records.filter((r) => {
          const d = new Date(r.date);
          return d >= weekStart && d <= weekEnd && r.status === "presente";
        }).length;
        weeks.push({ name: `Sem ${4 - i}`, presenca: count });
      }

      return {
        totalStudents,
        present,
        justified,
        unjustified,
        weeks,
        alertStudents,
        pendingList,
        studentsWithoutMass,
        massEndOfMonthAlert,
        daysLeftInMonth,
      };
    },
    enabled: !!user,
  });

  const pendingCount = stats?.pendingList?.length ?? 0;
  const missasPendingCount = stats?.studentsWithoutMass?.length ?? 0;

  return (
    <div className="pb-24">
      <PageHeader
        title="Catequese Bom Pastor"
        subtitle={
          isAdmin
            ? "Painel geral — todas as turmas"
            : (user?.etapa ?? "Sem etapa atribuída")
        }
      />

      {/* Boas-vindas */}
      <div className="px-4 mb-5">
        <p className="text-xl font-bold text-foreground">
          Bem-vindo, {user?.name}!
        </p>
        <div className="flex items-center gap-1.5 mt-1">
          {isAdmin ? (
            <p className="text-sm text-muted-foreground">
              Você está vendo dados de{" "}
              <span className="font-medium text-foreground">
                todas as turmas
              </span>
              .
            </p>
          ) : user?.etapa ? (
            <>
              <BookOpen className="h-3.5 w-3.5 text-primary" />
              <p className="text-sm text-muted-foreground">
                Etapa:{" "}
                <span className="font-semibold text-primary">{user.etapa}</span>
              </p>
            </>
          ) : (
            <p className="text-sm text-warning">
              Você ainda não tem uma etapa atribuída.
            </p>
          )}
        </div>
      </div>

      {/* Cards de estatísticas */}
      <div className="grid grid-cols-2 gap-3 px-4">
        <StatCard
          label="Total de Alunos"
          value={stats?.totalStudents ?? 0}
          icon={Users}
        />
        <StatCard
          label="Presenças"
          value={stats?.present ?? 0}
          icon={CheckCircle}
          variant="success"
        />
        <StatCard
          label="Faltas Justificadas"
          value={stats?.justified ?? 0}
          icon={AlertTriangle}
          variant="warning"
        />
        <StatCard
          label="Faltas Não Justificadas"
          value={stats?.unjustified ?? 0}
          icon={XCircle}
          variant="destructive"
        />
      </div>

      {/* Aviso de missas pendentes */}
      {missasPendingCount > 0 && (
        <button
          onClick={() => navigate("/missas")}
          className="w-full text-left"
        >
          <div
            className={`mx-4 mt-4 rounded-lg border p-4 ${
              stats?.massEndOfMonthAlert
                ? "border-destructive/40 bg-destructive/10"
                : "border-warning/40 bg-warning/10"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <Church
                className={`h-5 w-5 ${
                  stats?.massEndOfMonthAlert
                    ? "text-destructive"
                    : "text-warning"
                }`}
              />
              <span
                className={`font-bold ${
                  stats?.massEndOfMonthAlert
                    ? "text-destructive"
                    : "text-warning"
                }`}
              >
                {stats?.massEndOfMonthAlert
                  ? `⚠️ Fim do mês — Missas pendentes`
                  : `Missas — ${missasPendingCount} aluno${
                      missasPendingCount !== 1 ? "s" : ""
                    } sem registro`}
              </span>
            </div>
            <p
              className={`text-sm ${
                stats?.massEndOfMonthAlert
                  ? "text-destructive"
                  : "text-warning"
              }`}
            >
              {stats?.massEndOfMonthAlert
                ? `Faltam ${stats.daysLeftInMonth} dia${
                    stats.daysLeftInMonth !== 1 ? "s" : ""
                  } para fechar o mês. `
                : ""}
              {missasPendingCount} aluno
              {missasPendingCount !== 1 ? "s" : ""} ainda não
              {missasPendingCount !== 1 ? " foram" : " foi"} à missa este mês.
              <span className="ml-1 underline underline-offset-2 text-xs">
                Ver missas →
              </span>
            </p>
            {stats!.studentsWithoutMass.length <= 5 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {stats!.studentsWithoutMass.map((s) => (
                  <span
                    key={s.id}
                    className={`text-xs rounded-full px-2 py-0.5 font-medium ${
                      stats?.massEndOfMonthAlert
                        ? "bg-destructive/20 text-destructive"
                        : "bg-warning/20 text-warning"
                    }`}
                  >
                    {s.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </button>
      )}

      {/* Justificativas pendentes */}
      {pendingCount > 0 && (
        <div className="mx-4 mt-4 rounded-lg border border-warning/40 bg-warning/10 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-5 w-5 text-warning" />
            <span className="font-bold text-warning">
              {pendingCount} Justificativa
              {pendingCount > 1 ? "s" : ""} Aguardando
            </span>
          </div>
          <p className="text-xs text-muted-foreground mb-2">
            Enviadas pelos pais antes da chamada ser registrada. Serão
            aplicadas automaticamente ao salvar a chamada.
          </p>
          <div className="space-y-1">
            {stats!.pendingList.map((p) => (
              <p key={p.id} className="text-sm font-medium text-foreground">
                {(p.students as any)?.name ?? "Aluno"}{" "}
                <span className="text-muted-foreground font-normal">
                  — {p.date}
                </span>
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Alunos em alerta (3+ faltas não justificadas) */}
      {(stats?.alertStudents?.length ?? 0) > 0 && (
        <div className="mx-4 mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <span className="font-bold text-destructive">Alunos em Alerta</span>
          </div>
          <p className="text-xs text-muted-foreground mb-2">
            Alunos com 3 ou mais faltas não justificadas:
          </p>
          <div className="space-y-1">
            {stats!.alertStudents.map((s) => (
              <p key={s.name} className="text-sm font-medium text-destructive">
                {s.name} — {s.count} faltas
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Gráfico de frequência semanal */}
      <div className="mt-6 px-4">
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          Frequência Semanal
        </h2>
        <div className="rounded-lg bg-card p-4 shadow-sm border border-border">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats?.weeks ?? []}>
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12 }}
                stroke="hsl(var(--muted-foreground))"
              />
              <YAxis
                tick={{ fontSize: 12 }}
                stroke="hsl(var(--muted-foreground))"
              />
              <Tooltip />
              <Bar
                dataKey="presenca"
                fill="hsl(213, 70%, 45%)"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
