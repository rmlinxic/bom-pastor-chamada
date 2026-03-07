import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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

export function useAllAttendance() {
  return useQuery({
    queryKey: ["attendance-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("*, students(name, class_name)")
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useSaveAttendance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      records: { student_id: string; date: string; status: string }[]
    ) => {
      const { error } = await supabase.from("attendance").upsert(records, {
        onConflict: "student_id,date",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      queryClient.invalidateQueries({ queryKey: ["attendance-all"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success("Chamada salva com sucesso!");
    },
    onError: () => {
      toast.error("Erro ao salvar chamada.");
    },
  });
}

// Aceita studentId diretamente (selecionado pelo pai via dropdown)
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
    }) => {
      const { data: updated, error } = await supabase
        .from("attendance")
        .update({
          status: "falta_justificada",
          justification_reason: reason,
        })
        .eq("student_id", studentId)
        .eq("date", date)
        .eq("status", "falta_nao_justificada")
        .select();

      if (error) throw error;
      if (!updated || updated.length === 0)
        throw new Error(
          "Nenhum registro de falta não justificada encontrado para essa data. Verifique se a chamada foi registrada pelo catequista."
        );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance-all"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success("Justificativa enviada com sucesso!");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Erro ao enviar justificativa.");
    },
  });
}
