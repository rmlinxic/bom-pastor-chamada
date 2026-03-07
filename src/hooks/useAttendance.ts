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

export function useSubmitJustification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      studentName,
      date,
      reason,
    }: {
      studentName: string;
      date: string;
      reason: string;
    }) => {
      // Find student by name
      const { data: students, error: findError } = await supabase
        .from("students")
        .select("id")
        .ilike("name", studentName.trim());
      if (findError) throw findError;
      if (!students || students.length === 0)
        throw new Error("Aluno n\u00e3o encontrado. Verifique o nome digitado.");

      const studentId = students[0].id;

      // Update attendance record: falta_nao_justificada -> falta_justificada
      // Using .select() to verify that a row was actually updated (count would be null without {count:'exact'})
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
          "Nenhum registro de falta n\u00e3o justificada encontrado para essa data. Verifique se a chamada foi registrada."
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
