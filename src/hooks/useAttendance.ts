import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { readAllRows } from "@/lib/query-pages";
import { useAuth, type CatequistaUser } from "@/contexts/AuthContext";

const db = supabase as any;

export type AttendanceRecord = Tables<"attendance"> & {
  students: { name: string; class_name: string; paroquia_id?: string | null } | null;
};

export function useAttendanceByDate(date: string) {
  const { user, isAdmin, isCoordinator } = useAuth();
  return useQuery({
    queryKey: ["attendance", date, user?.id, user?.etapa, user?.paroquia_id, isCoordinator, isAdmin],
    queryFn: async () => {
      if (!user) return [];
      let query = supabase
        .from("attendance")
        .select("*, students(name, class_name)")
        .eq("date", date);
      if (!isAdmin) {
        const studentIds = await getVisibleStudentIds(user, isCoordinator);
        if (studentIds.length === 0) return [];
        query = query.in("student_id", studentIds);
      }
      query = query.order("id");
      const rows = await readAllRows((from, to) => query.range(from, to));
      return rows as unknown as AttendanceRecord[];
    },
    enabled: !!user && !!date,
    refetchInterval: 30_000,
  });
}

async function getVisibleStudentIds(user: CatequistaUser, isCoordinator: boolean, includeInactive = false): Promise<string[]> {
  let query = db.from("students").select("id");
  if (!includeInactive) query = query.eq("active", true);
  if (isCoordinator && user.paroquia_id) {
    query = query.eq("paroquia_id", user.paroquia_id);
  } else {
    query = query.or(
      `catequista_id.eq.${user.id},and(catequista_id.is.null,class_name.eq.${user.etapa ?? "__nenhuma__"},${user.paroquia_id ? `paroquia_id.eq.${user.paroquia_id}` : "paroquia_id.is.null"})`
    );
  }
  query = query.order("id");
  const students = await readAllRows<{ id: string }>((from, to) => query.range(from, to));
  return students.map((student) => student.id);
}

export function useAllAttendance() {
  const { user, isAdmin, isCoordinator } = useAuth();

  return useQuery({
    queryKey: ["attendance-all", user?.id, user?.etapa, user?.paroquia_id, isCoordinator, isAdmin],
    queryFn: async () => {
      if (!user) return [];
      let query = supabase
        .from("attendance")
        .select("*, students(name, class_name, paroquia_id)");
      if (!isAdmin) {
        const studentIds = await getVisibleStudentIds(user, isCoordinator, true);
        if (studentIds.length === 0) return [];
        query = query.in("student_id", studentIds);
      }
      query = query.order("date", { ascending: false }).order("id");
      const rows = await readAllRows((from, to) => query.range(from, to));
      return rows as unknown as AttendanceRecord[];
    },
    enabled: !!user,
  });
}

export function usePendingJustifications() {
  const { user, isAdmin, isCoordinator } = useAuth();

  return useQuery({
    queryKey: ["pending-justifications", user?.id, user?.etapa, user?.paroquia_id, isCoordinator, isAdmin],
    queryFn: async () => {
      if (!user) return [];
      let query = db
        .from("pending_justifications")
        .select("*, students(name, class_name, paroquia_id)");
      if (!isAdmin) {
        const studentIds = await getVisibleStudentIds(user, isCoordinator);
        if (studentIds.length === 0) return [];
        query = query.in("student_id", studentIds);
      }
      query = query.order("date", { ascending: true }).order("id");
      return await readAllRows<any>((from, to) => query.range(from, to));
    },
    enabled: !!user,
    refetchInterval: 30_000,
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

export function useUpdatePendingJustification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, date, reason }: { id: string; date: string; reason: string }) => {
      const { error } = await db
        .from("pending_justifications")
        .update({ date, reason })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-justifications"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success("Justificativa atualizada com sucesso.");
    },
    onError: () => toast.error("Erro ao atualizar justificativa."),
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

      // Match each student/date pair so batches spanning several dates cannot
      // apply a justification to a different attendance record.
      const dates = [...new Set(absences.map((record) => record.date))];
      let autoJustified = 0;
      for (const date of dates) {
        const studentIds = absences
          .filter((record) => record.date === date)
          .map((record) => record.student_id);
        const { data: pending, error: pendingError } = await db
          .from("pending_justifications")
          .select("*")
          .in("student_id", studentIds)
          .eq("date", date);
        if (pendingError) throw pendingError;

        for (const pj of pending ?? []) {
          const { error: updateError } = await supabase
            .from("attendance")
            .update({
              status: "falta_justificada",
              justification_reason: pj.reason,
            })
            .eq("student_id", pj.student_id)
            .eq("date", pj.date);
          if (updateError) throw updateError;

          const { error: deleteError } = await db
            .from("pending_justifications")
            .delete()
            .eq("id", pj.id);
          if (deleteError) throw deleteError;
          autoJustified += 1;
        }
      }
      return autoJustified;
    },
    onSuccess: (autoJustified: number) => {
      if (autoJustified > 0) {
        toast.success(
          `Chamada salva! ${autoJustified} falta(s) justificada(s) automaticamente.`
        );
      } else {
        toast.success("Chamada salva com sucesso!");
      }
    },
    // The upsert may have succeeded before a later request failed.
    onSettled: () => {
      for (const key of ["attendance", "attendance-all", "dashboard-stats", "pending-justifications", "student-history"]) {
        queryClient.invalidateQueries({ queryKey: [key] });
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
    mutationFn: async ({ studentName, guardianContact, paroquiaId, date, reason }: {
      studentName: string;
      guardianContact: string;
      paroquiaId: string;
      date: string;
      reason: string;
    }): Promise<{ pending: boolean }> => {
      // The server verifies the supplied name/contact without exposing student
      // identities, match results, or attendance status to the public caller.
      const { error } = await db.rpc("submit_public_justification", {
        student_name: studentName,
        guardian_contact: guardianContact,
        paroquia_id: paroquiaId,
        date,
        reason,
      });
      if (error) throw new Error("Não foi possível enviar a justificativa. Tente novamente.");
      return { pending: true };
    },
    onSuccess: () => {
      for (const key of ["attendance", "student-history", "attendance-all", "dashboard-stats", "pending-justifications"]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      toast.success("Solicitação recebida. A justificativa será processada após a conferência dos dados informados.");
    },
    onError: (err: Error) => toast.error(err.message || "Erro ao enviar justificativa."),
  });
}
