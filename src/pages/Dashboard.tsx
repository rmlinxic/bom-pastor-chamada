import { useState, useMemo } from "react";
import {
  Clock, Users, CheckCircle, AlertTriangle, XCircle,
  BookOpen, Church, Building2, MessageCircle,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getDaysInMonth, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useParoquias } from "@/hooks/useParoquias";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";

const db = supabase as any;

function todayMonthStr() { return new Date().toISOString().slice(0, 7); }
function lastDayOfMonth(monthStr: string) {
  const [y, m] = monthStr.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

/** Formata telefone para link WhatsApp: remove tudo que não é dígito, aplica DDD 41 se necessario */
function toWhatsappNumber(raw: string | null | undefined): string {
  if (!raw) return "5541";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return "5541";
  // Já tem código do país
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  // Tem DDD (10 ou 11 dígitos)
  if (digits.length >= 10) return "55" + digits;
  // Sem DDD: presume 41
  return "5541" + digits;
}

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { data: paroquias = [] } = useParoquias();
  const [selectedParoquia, setSelectedParoquia] = useState<string>("all");

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats", user?.id, user?.etapa, selectedParoquia],
    queryFn: async () => {
      // 1. Alunos
      let studentsQuery = db
        .from("students")
        .select("id, name, phone, parent_name", { count: "exact" })
        .eq("active", true);

      if (!isAdmin && user?.id) {
        studentsQuery = studentsQuery.or(
          `catequista_id.eq.${user.id},and(catequista_id.is.null,class_name.eq.${user.etapa ?? "__nenhuma__"})`
        );
      } else if (isAdmin && selectedParoquia !== "all") {
        studentsQuery = studentsQuery.eq("paroquia_id", selectedParoquia);
      }

      const studentsRes = await studentsQuery;
      const totalStudents = studentsRes.count ?? 0;
      const allStudents: { id: string; name: string; phone: string | null; parent_name: string | null }[] = studentsRes.data ?? [];
      const studentIds = allStudents.map((s) => s.id);

      if (studentIds.length === 0) {
        return {
          totalStudents: 0, present: 0, justified: 0, unjustified: 0,
          chartData: [],
          alertStudents: [], pendingList: [], studentsWithoutMass: [],
          massEndOfMonthAlert: false, daysLeftInMonth: 0,
        };
      }

      // 2. Presenças
      const records: { student_id: string; status: string; date: string }[] =
        (await db.from("attendance").select("student_id, status, date").in("student_id", studentIds)).data ?? [];

      // 3. Justificativas pendentes
      const pendingList =
        (await db.from("pending_justifications").select("id, date, students(name)").in("student_id", studentIds)).data ?? [];

      // 4. Missas
      const month = todayMonthStr();
      const lastDay = lastDayOfMonth(month);
      const massRes = await db.from("mass_attendance").select("student_id")
        .in("student_id", studentIds)
        .gte("date", `${month}-01`)
        .lte("date", `${month}-${String(lastDay).padStart(2, "0")}`);
      const studentsWithMassSet = new Set((massRes.data ?? []).map((r: any) => r.student_id));
      const studentsWithoutMass = allStudents.filter((s) => !studentsWithMassSet.has(s.id));

      const today = new Date();
      const daysLeftInMonth = getDaysInMonth(today) - today.getDate();
      const massEndOfMonthAlert = daysLeftInMonth <= 7 && studentsWithoutMass.length > 0;

      // 5. Totais
      const present = records.filter((r) => r.status === "presente").length;
      const justified = records.filter((r) => r.status === "falta_justificada").length;
      const unjustified = records.filter((r) => r.status === "falta_nao_justificada").length;

      // 6. Alunos com faltas não justificadas >= 2 (alerta mais cedo)
      const unjustifiedCounts: Record<string, number> = {};
      records.forEach((r) => {
        if (r.status === "falta_nao_justificada")
          unjustifiedCounts[r.student_id] = (unjustifiedCounts[r.student_id] || 0) + 1;
      });
      const alertStudents = allStudents
        .filter((s) => (unjustifiedCounts[s.id] ?? 0) >= 2)
        .map((s) => ({
          id: s.id,
          name: s.name,
          phone: s.phone ?? null,
          parent_name: s.parent_name ?? null,
          count: unjustifiedCounts[s.id],
        }))
        .sort((a, b) => b.count - a.count);

      // 7. Gráfico: 1 barra por dia com registro, ordenado cronologicamente
      const dayMap: Record<string, number> = {};
      records.forEach((r) => {
        if (r.status === "presente") {
          dayMap[r.date] = (dayMap[r.date] || 0) + 1;
        }
      });
      // Todos os dias que têm qualquer registro (não apenas presenças)
      const allDates = new Set(records.map((r) => r.date));
      const chartData = Array.from(allDates)
        .sort()
        .map((date) => ({
          name: format(parseISO(date), "dd/MM", { locale: ptBR }),
          presenca: dayMap[date] ?? 0,
        }));

      return {
        totalStudents, present, justified, unjustified,
        chartData,
        alertStudents, pendingList, studentsWithoutMass,
        massEndOfMonthAlert, daysLeftInMonth,
      };
    },
    enabled: !!user,
  });

  const pendingCount = stats?.pendingList?.length ?? 0;
  const missasPendingCount = stats?.studentsWithoutMass?.length ?? 0;
  const paroquiasAtivas = useMemo(() => paroquias.filter((p) => p.ativa), [paroquias]);

  return (
    <div className="pb-24">
      <PageHeader
        title="Catequese Bom Pastor"
        subtitle={isAdmin ? "Painel geral" : (user?.etapa ?? "Sem etapa atribuída")}
      />

      <div className="px-4 mb-4">
        <p className="text-xl font-bold text-foreground">Bem-vindo, {user?.name}!</p>
        <div className="flex items-center gap-1.5 mt-1">
          {isAdmin ? (
            <p className="text-sm text-muted-foreground">Você está vendo dados de{" "}
              <span className="font-medium text-foreground">
                {selectedParoquia === "all" ? "todas as paróquias" : (paroquias.find((p) => p.id === selectedParoquia)?.nome ?? "paróquia selecionada")}
              </span>.
            </p>
          ) : user?.etapa ? (
            <>
              <BookOpen className="h-3.5 w-3.5 text-primary" />
              <p className="text-sm text-muted-foreground">Etapa: <span className="font-semibold text-primary">{user.etapa}</span></p>
            </>
          ) : (
            <p className="text-sm text-warning">Você ainda não tem uma etapa atribuída.</p>
          )}
        </div>
      </div>

      {/* Filtro por paróquia — apenas admin */}
      {isAdmin && paroquiasAtivas.length > 1 && (
        <div className="px-4 mb-4 flex gap-2 overflow-x-auto pb-1">
          <button onClick={() => setSelectedParoquia("all")}
            className={cn("shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors flex items-center gap-1.5",
              selectedParoquia === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            <Building2 className="h-3.5 w-3.5" /> Todas
          </button>
          {paroquiasAtivas.map((p) => (
            <button key={p.id} onClick={() => setSelectedParoquia(p.id)}
              className={cn("shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                selectedParoquia === p.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {p.nome}
            </button>
          ))}
        </div>
      )}

      {/* Cards de estatísticas */}
      <div className="grid grid-cols-2 gap-3 px-4">
        <StatCard label="Total de Alunos" value={stats?.totalStudents ?? 0} icon={Users} />
        <StatCard label="Presenças" value={stats?.present ?? 0} icon={CheckCircle} variant="success" />
        <StatCard label="Faltas Justificadas" value={stats?.justified ?? 0} icon={AlertTriangle} variant="warning" />
        <StatCard label="Faltas Não Justificadas" value={stats?.unjustified ?? 0} icon={XCircle} variant="destructive" />
      </div>

      {/* ===== ALERTA DE FALTAS NÃO JUSTIFICADAS ===== */}
      {(stats?.alertStudents?.length ?? 0) > 0 && (
        <div className="mx-4 mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
          <div className="flex items-center gap-2 mb-1">
            <XCircle className="h-5 w-5 text-destructive" />
            <span className="font-bold text-destructive">Alunos com Faltas Recorrentes</span>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Alunos com 2 ou mais faltas não justificadas. Considere entrar em contato com o responsável.
          </p>
          <div className="space-y-2">
            {stats!.alertStudents.map((s) => {
              const wn = toWhatsappNumber(s.phone);
              const hasPhone = s.phone && s.phone.replace(/\D/g, "").length >= 8;
              return (
                <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-destructive truncate">{s.name}</p>
                    <p className="text-xs text-destructive/80">
                      {s.count} falta{s.count !== 1 ? "s" : ""} não justificada{s.count !== 1 ? "s" : ""}
                      {s.parent_name ? <span className="text-muted-foreground"> · Resp: {s.parent_name}</span> : null}
                    </p>
                  </div>
                  {hasPhone ? (
                    <a
                      href={`https://wa.me/${wn}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 flex items-center gap-1.5 rounded-full bg-[#25D366] text-white text-xs font-semibold px-3 py-1.5 hover:bg-[#1ebe5d] transition-colors"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      WhatsApp
                    </a>
                  ) : (
                    <span className="shrink-0 text-xs text-muted-foreground italic">Sem telefone</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Aviso missas pendentes */}
      {missasPendingCount > 0 && (
        <button onClick={() => navigate("/missas")} className="w-full text-left">
          <div className={`mx-4 mt-4 rounded-lg border p-4 ${stats?.massEndOfMonthAlert ? "border-destructive/40 bg-destructive/10" : "border-warning/40 bg-warning/10"}`}>
            <div className="flex items-center gap-2 mb-1">
              <Church className={`h-5 w-5 ${stats?.massEndOfMonthAlert ? "text-destructive" : "text-warning"}`} />
              <span className={`font-bold ${stats?.massEndOfMonthAlert ? "text-destructive" : "text-warning"}`}>
                {stats?.massEndOfMonthAlert ? `⚠️ Fim do mês — Missas pendentes` : `Missas — ${missasPendingCount} aluno${missasPendingCount !== 1 ? "s" : ""} sem registro`}
              </span>
            </div>
            <p className={`text-sm ${stats?.massEndOfMonthAlert ? "text-destructive" : "text-warning"}`}>
              {stats?.massEndOfMonthAlert ? `Faltam ${stats.daysLeftInMonth} dia${stats.daysLeftInMonth !== 1 ? "s" : ""} para fechar o mês. ` : ""}
              {missasPendingCount} aluno{missasPendingCount !== 1 ? "s" : ""} ainda não{missasPendingCount !== 1 ? " foram" : " foi"} à missa este mês.
              <span className="ml-1 underline underline-offset-2 text-xs">Ver missas →</span>
            </p>
            {stats!.studentsWithoutMass.length <= 5 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {stats!.studentsWithoutMass.map((s: any) => (
                  <span key={s.id} className={`text-xs rounded-full px-2 py-0.5 font-medium ${stats?.massEndOfMonthAlert ? "bg-destructive/20 text-destructive" : "bg-warning/20 text-warning"}`}>
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
            <span className="font-bold text-warning">{pendingCount} Justificativa{pendingCount > 1 ? "s" : ""} Aguardando</span>
          </div>
          <p className="text-xs text-muted-foreground mb-2">Enviadas pelos pais antes da chamada ser registrada.</p>
          <div className="space-y-1">
            {stats!.pendingList.map((p: any) => (
              <p key={p.id} className="text-sm font-medium text-foreground">
                {(p.students as any)?.name ?? "Aluno"} <span className="text-muted-foreground font-normal">— {p.date}</span>
              </p>
            ))}
          </div>
        </div>
      )}

      {/* ===== GRÁFICO POR DIA ===== */}
      <div className="mt-6 px-4 pb-2">
        <h2 className="mb-1 text-lg font-semibold text-foreground">Frequência por Dia</h2>
        <p className="text-xs text-muted-foreground mb-3">
          {(stats?.chartData?.length ?? 0) === 0
            ? "Nenhum registro de presença ainda."
            : `${stats!.chartData.length} dia${stats!.chartData.length !== 1 ? "s" : ""} com registros`}
        </p>
        {(stats?.chartData?.length ?? 0) > 0 ? (
          <div className="rounded-lg bg-card p-4 shadow-sm border border-border overflow-x-auto">
            {/* Largura mínima dinâmica para muitos dias não ficarem espremidos */}
            <div style={{ minWidth: Math.max(300, (stats?.chartData?.length ?? 0) * 44) }}>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={stats?.chartData ?? []} margin={{ left: -16, right: 4 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" interval={0} angle={-35} textAnchor="end" height={40} />
                  <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                  <Tooltip formatter={(v) => [`${v} presença${Number(v) !== 1 ? "s" : ""}`, "Presenças"]} />
                  <Bar dataKey="presenca" fill="hsl(213, 70%, 45%)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div className="rounded-lg bg-card border border-border p-8 text-center">
            <p className="text-muted-foreground text-sm">As barras aparecerão conforme as chamadas forem registradas.</p>
          </div>
        )}
      </div>
    </div>
  );
}
