import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

const db = supabase as any;

export function useAttendanceByDate(date: string) {
  return useQuery({
    queryKey: ["attendance", date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("*, students(name, class_name)")
        .eq("date", date);
      if (error) throw error;
      return data;
    },
    enabled: !!date,
  });
}

/**
 * Busca os IDs de todos os alunos ativos de uma paróquia.
 * Usado para filtrar attendance/justifications sem depender do join.
 */
async function getParoquiaStudentIds(paroquiaId: string): Promise<string[]> {
  const { data } = await db
    .from("students")
    .select("id")
    .eq("paroquia_id", paroquiaId)
    .eq("active", true);
  return (data ?? []).map((s: any) => s.id);
}

export function useAllAttendance() {
  const { user, isAdmin, isCoordinator } = useAuth();

  return useQuery({
    queryKey: ["attendance-all", user?.id, user?.etapa, user?.paroquia_id, isCoordinator],
    queryFn: async () => {
      // Admin: busca tudo direto
      if (isAdmin) {
        const { data, error } = await supabase
          .from("attendance")
          .select("*, students(name, class_name, paroquia_id)")
          .order("date", { ascending: false });
        if (error) throw error;
        return data ?? [];
      }

      // Coordenador: busca pelos IDs dos alunos da paróquia (não depende do paroquia_id no join)
      if (isCoordinator && user?.paroquia_id) {
        const studentIds = await getParoquiaStudentIds(user.paroquia_id);
        if (studentIds.length === 0) return [];
        const { data, error } = await supabase
          .from("attendance")
          .select("*, students(name, class_name, paroquia_id)")
          .in("student_id", studentIds)
          .order("date", { ascending: false });
        if (error) throw error;
        return data ?? [];
      }

      // Catequista: apenas sua etapa
      if (user?.id) {
        // Busca os IDs dos seus alunos
        const { data: myStudents } = await db
          .from("students")
          .select("id")
          .eq("active", true)
          .or(`catequista_id.eq.${user.id},and(catequista_id.is.null,class_name.eq.${
            user.etapa ?? "__nenhuma__"
          })`);
        const ids = (myStudents ?? []).map((s: any) => s.id);
        if (ids.length === 0) return [];
        const { data, error } = await supabase
          .from("attendance")
          .select("*, students(name, class_name, paroquia_id)")
          .in("student_id", ids)
          .order("date", { ascending: false });
        if (error) throw error;
        return data ?? [];
      }

      return [];
    },
    enabled: !!user,
  });
}

export function usePendingJustifications() {
  const { user, isAdmin, isCoordinator } = useAuth();

  return useQuery({
    queryKey: ["pending-justifications", user?.id, user?.etapa, user?.paroquia_id, isCoordinator],
    queryFn: async () => {
      // Admin: tudo
      if (isAdmin) {
        const { data, error } = await db
          .from("pending_justifications")
          .select("*, students(name, class_name, paroquia_id)")
          .order("date", { ascending: true });
        if (error) throw error;
        return (data ?? []) as any[];
      }

      // Coordenador: pelos IDs dos alunos da paróquia
      if (isCoordinator && user?.paroquia_id) {
        const studentIds = await getParoquiaStudentIds(user.paroquia_id);
        if (studentIds.length === 0) return [];
        const { data, error } = await db
          .from("pending_justifications")
          .select("*, students(name, class_name, paroquia_id)")
          .in("student_id", studentIds)
          .order("date", { ascending: true });
        if (error) throw error;
        return (data ?? []) as any[];
      }

      // Catequista: pelos IDs dos seus alunos
      if (user?.id) {
        const { data: myStudents } = await db
          .from("students")
          .select("id")
          .eq("active", true)
          .or(`catequista_id.eq.${user.id},and(catequista_id.is.null,class_name.eq.${
            user.etapa ?? "__nenhuma__"
          })`);
        const ids = (myStudents ?? []).map((s: any) => s.id);
        if (ids.length === 0) return [];
        const { data, error } = await db
          .from("pending_justifications")
          .select("*, students(name, class_name, paroquia_id)")
          .in("student_id", ids)
          .order("date", { ascending: true });
        if (error) throw error;
        return (data ?? []) as any[];
      }

      return [];
    },
    enabled: !!user,
  });
}

export function useDeletePendingJustification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db
        .from("pending_justifications")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-justifications"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success("Justificativa pendente removida.");
    },
    onError: () => toast.error("Erro ao remover justificativa."),
  });
}

export function useSaveAttendance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      records: { student_id: string; date: string; status: string }[]
    ) => {
      if (records.length === 0) return 0;

      const { error } = await supabase.from("attendance").upsert(records, {
        onConflict: "student_id,date",
      });
      if (error) throw error;

      const absences = records.filter(
        (r) => r.status === "falta_nao_justificada"
      );
      if (absences.length === 0) return 0;

      const date = records[0].date;
      const studentIds = absences.map((r) => r.student_id);

      const { data: pending } = await db
        .from("pending_justifications")
        .select("*")
        .in("student_id", studentIds)
        .eq("date", date);

      if (!pending || pending.length === 0) return 0;

      for (const pj of pending) {
        await supabase
          .from("attendance")
          .update({
            status: "falta_justificada",
            justification_reason: pj.reason,
          })
          .eq("student_id", pj.student_id)
          .eq("date", pj.date);

        await db.from("pending_justifications").delete().eq("id", pj.id);
      }

      return pending.length;
    },
    onSuccess: (autoJustified: number) => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      queryClient.invalidateQueries({ queryKey: ["attendance-all"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["pending-justifications"] });
      if (autoJustified > 0) {
        toast.success(
          `Chamada salva! ${autoJustified} falta(s) justificada(s) automaticamente.`
        );
      } else {
        toast.success("Chamada salva com sucesso!");
      }
    },
    onError: () => toast.error("Erro ao salvar chamada."),
  });
}

export function useDeleteAttendance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("attendance")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance-all"] });
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["student-history"] });
      toast.success("Registro apagado.");
    },
    onError: () => toast.error("Erro ao apagar registro."),
  });
}

export function useSubmitJustification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      studentId,
      date,
      reason,
    }: {
      studentId: string;
      date: string;
      reason: string;
    }): Promise<{ pending: boolean }> => {
      const { data: existing, error: fetchError } = await supabase
        .from("attendance")
        .select("id, status")
        .eq("student_id", studentId)
        .eq("date", date)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (existing) {
        if (existing.status === "presente") {
          throw new Error("O aluno estava presente nessa data.");
        }
        if (existing.status === "falta_justificada") {
          throw new Error("Essa falta já está justificada.");
        }
        const { error } = await supabase
          .from("attendance")
          .update({
            status: "falta_justificada",
            justification_reason: reason,
          })
          .eq("id", existing.id);
        if (error) throw error;
        return { pending: false };
      } else {
        const { error } = await db
          .from("pending_justifications")
          .upsert(
            { student_id: studentId, date, reason },
            { onConflict: "student_id,date" }
          );
        if (error) throw error;
        return { pending: true };
      }
    },
    onSuccess: (result: { pending: boolean }) => {
      queryClient.invalidateQueries({ queryKey: ["attendance-all"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["pending-justifications"] });
      if (result.pending) {
        toast.success(
          "Justificativa registrada! Será aplicada automaticamente quando a chamada for marcada."
        );
      } else {
        toast.success("Falta justificada com sucesso!");
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || "Erro ao enviar justificativa.");
    },
  });
}
