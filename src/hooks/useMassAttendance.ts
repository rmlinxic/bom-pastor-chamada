import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const db = supabase as any;

export type MassRecord = {
  id: string;
  student_id: string;
  date: string;
  students: { name: string } | null;
};

function lastDayOfMonth(monthStr: string): string {
  const [y, m] = monthStr.split("-").map(Number);
  const day = new Date(y, m, 0).getDate();
  return `${monthStr}-${String(day).padStart(2, "0")}`;
}

/**
 * Busca todos os registros de missa de um mês para uma lista de alunos.
 * Filtrado por etapa: o hook recebe apenas os IDs dos alunos do catequista.
 */
export function useMassAttendanceByMonth(
  studentIds: string[],
  month: string
) {
  return useQuery({
    queryKey: ["mass-attendance", month, studentIds],
    queryFn: async () => {
      const { data, error } = await db
        .from("mass_attendance")
        .select("id, student_id, date, students(name)")
        .in("student_id", studentIds)
        .gte("date", `${month}-01`)
        .lte("date", lastDayOfMonth(month))
        .order("date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MassRecord[];
    },
    enabled: studentIds.length > 0,
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
      toast.success("Registro removido.");
    },
    onError: () => toast.error("Erro ao remover registro."),
  });
}
