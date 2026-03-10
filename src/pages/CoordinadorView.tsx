import { useMemo } from "react";
import { Building2, BookOpen, Users, BarChart3, TrendingUp } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useCatequistasByParoquia } from "@/hooks/useCatequistas";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const db = supabase as any;

function useParishStats(paroquia_id: string | null) {
  return useQuery({
    queryKey: ["parish-stats", paroquia_id],
    enabled: !!paroquia_id,
    queryFn: async () => {
      // Busca todos os alunos da paróquia
      const { data: students } = await db
        .from("students")
        .select("id, name, class_name, catequista_id")
        .eq("paroquia_id", paroquia_id)
        .eq("active", true);

      if (!students?.length) return { students: [], attendanceByClass: {} };

      const studentIds = students.map((s: any) => s.id);

      // Busca presenças
      const { data: attendance } = await db
        .from("attendance")
        .select("student_id, status")
        .in("student_id", studentIds);

      const attendanceByStudent: Record<string, { present: number; total: number }> = {};
      for (const s of students) {
        attendanceByStudent[s.id] = { present: 0, total: 0 };
      }
      for (const a of (attendance ?? [])) {
        if (attendanceByStudent[a.student_id]) {
          attendanceByStudent[a.student_id].total++;
          if (a.status === "present") attendanceByStudent[a.student_id].present++;
        }
      }

      // Agrupa por etapa/catequista
      const byClass: Record<string, { catequista_id: string; alunos: number; presencaMedia: number }> = {};
      for (const s of students) {
        const key = s.class_name;
        if (!byClass[key]) byClass[key] = { catequista_id: s.catequista_id, alunos: 0, presencaMedia: 0 };
        byClass[key].alunos++;
        const att = attendanceByStudent[s.id];
        byClass[key].presencaMedia += att.total > 0 ? att.present / att.total : 0;
      }
      for (const key of Object.keys(byClass)) {
        byClass[key].presencaMedia = byClass[key].alunos > 0
          ? Math.round((byClass[key].presencaMedia / byClass[key].alunos) * 100)
          : 0;
      }

      return { students, attendanceByClass: byClass };
    },
  });
}

export default function CoordinadorView() {
  const { user } = useAuth();
  const { data: catequistas = [], isLoading: loadingCat } = useCatequistasByParoquia(user?.paroquia_id ?? null);
  const { data: stats, isLoading: loadingStats } = useParishStats(user?.paroquia_id ?? null);

  const catequistasMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of catequistas) m[c.id] = c.name;
    return m;
  }, [catequistas]);

  const isLoading = loadingCat || loadingStats;
  const attendanceByClass = stats?.attendanceByClass ?? {};
  const totalAlunos = stats?.students?.length ?? 0;
  const etapas = Object.keys(attendanceByClass).sort();

  return (
    <div className="pb-24">
      <PageHeader
        title="Visão da Paróquia"
        subtitle={user?.paroquia_nome ?? "Coordenador Paroquial"}
      />

      {/* Cards de resumo */}
      <div className="px-4 grid grid-cols-2 gap-3 mb-6">
        <div className="bg-card rounded-lg border border-border p-4 text-center">
          <Users className="h-6 w-6 text-primary mx-auto mb-1" />
          <p className="text-2xl font-bold text-primary">
            {catequistas.filter((c) => c.role === "catequista").length}
          </p>
          <p className="text-xs text-muted-foreground">Catequistas</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-4 text-center">
          <BookOpen className="h-6 w-6 text-primary mx-auto mb-1" />
          <p className="text-2xl font-bold text-primary">{totalAlunos}</p>
          <p className="text-xs text-muted-foreground">Catequizandos</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-4 text-center">
          <BarChart3 className="h-6 w-6 text-warning mx-auto mb-1" />
          <p className="text-2xl font-bold text-warning">{etapas.length}</p>
          <p className="text-xs text-muted-foreground">Etapas ativas</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-4 text-center">
          <TrendingUp className="h-6 w-6 text-success mx-auto mb-1" />
          <p className="text-2xl font-bold text-success">
            {etapas.length > 0
              ? Math.round(etapas.reduce((acc, k) => acc + attendanceByClass[k].presencaMedia, 0) / etapas.length)
              : 0}%
          </p>
          <p className="text-xs text-muted-foreground">Presença média</p>
        </div>
      </div>

      {/* Lista de catequistas */}
      <div className="px-4 mb-2">
        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          Catequistas da Paróquia
        </h2>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : (
        <div className="px-4 space-y-3">
          {catequistas.filter((c) => c.role === "catequista").length === 0 && (
            <p className="py-8 text-center text-muted-foreground">Nenhum catequista nesta paróquia ainda.</p>
          )}
          {catequistas
            .filter((c) => c.role === "catequista")
            .map((c) => {
              const etapa = c.etapa;
              const classStats = etapa ? attendanceByClass[etapa] : null;
              return (
                <div key={c.id} className="rounded-lg border border-border bg-card p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">@{c.username}</p>
                      {etapa && (
                        <div className="flex items-center gap-1.5 mt-2">
                          <BookOpen className="h-3.5 w-3.5 text-primary" />
                          <span className="text-sm font-medium text-primary">{etapa}</span>
                        </div>
                      )}
                    </div>
                    {classStats && (
                      <div className="text-right shrink-0">
                        <p className="text-xs text-muted-foreground">{classStats.alunos} alunos</p>
                        <p
                          className={cn(
                            "text-sm font-bold mt-0.5",
                            classStats.presencaMedia >= 75 ? "text-success" :
                            classStats.presencaMedia >= 50 ? "text-warning" : "text-destructive"
                          )}
                        >
                          {classStats.presencaMedia}% presença
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
