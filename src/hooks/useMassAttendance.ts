import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { monthDateRange } from "@/lib/dates";

const db = supabase as any;

export type MassRecord = {
  id: string;
  student_id: string;
  date: string;
  students: { name: string; paroquia_id?: string | null } | null;
};

/**
 * Busca registros de missa de um mês para uma lista de alunos.
 * Coordenador recebe a lista de IDs de TODOS os alunos da paróquia.
 */
export function useMassAttendanceByMonth(
  studentIds: string[],
  month: string
) {
  return useQuery({
    queryKey: ["mass-attendance", month, studentIds],
    queryFn: async () => {
      const { start, end } = monthDateRange(month);
      const { data, error } = await db
        .from("mass_attendance")
        .select("id, student_id, date, students(name, paroquia_id)")
        .in("student_id", studentIds)
        .gte("date", start)
        .lte("date", end)
        .order("date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MassRecord[];
    },
    enabled: studentIds.length > 0 && /^\d{4}-(0[1-9]|1[0-2])$/.test(month),
  });
}

/** Registra presença de um aluno em uma missa. */
export function useRegisterMassAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      studentId,
      date,
    }: {
      studentId: string;
      date: string;
    }) => {
      const { error } = await db
        .from("mass_attendance")
        .insert({ student_id: studentId, date });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mass-attendance"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success("Presença na missa registrada!");
    },
    onError: (err: Error) => {
      if (
        err.message?.includes("unique") ||
        err.message?.includes("duplicate") ||
        err.message?.includes("23505")
      ) {
        toast.error("Presença já registrada para esta data.");
      } else {
        toast.error("Erro ao registrar presença.");
      }
    },
  });
}

/** Remove um registro de missa. */
export function useDeleteMassAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db
        .from("mass_attendance")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mass-attendance"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success("Registro removido.");
    },
    onError: () => toast.error("Erro ao remover registro."),
  });
}

/**
 * Hook para coordenador: busca IDs de todos os alunos da paróquia
 * e repassa para useMassAttendanceByMonth.
 */
export function useParoquiaMassStudentIds() {
  const { user, isCoordinator, isAdmin } = useAuth();
  return useQuery({
    queryKey: ["paroquia-mass-student-ids", user?.id, user?.paroquia_id],
    queryFn: async () => {
      const { data, error } = await db
        .from("students")
        .select("id")
        .eq("paroquia_id", user!.paroquia_id)
        .eq("active", true);
      if (error) throw error;
      return (data ?? []).map((s: any) => s.id) as string[];
    },
    enabled: (isCoordinator || isAdmin) && !!user?.paroquia_id,
  });
}
