import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useAttendanceByDate(date: string) {
  return useQuery({
    queryKey: ["attendance", date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("*, students(name, class)")
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
        .select("*, students(name, class)")
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
      if (!students || students.length === 0) throw new Error("Aluno não encontrado.");

      const studentId = students[0].id;

      // Update attendance record
      const { error } = await supabase
        .from("attendance")
        .update({
          status: "justified_absence",
          justification_reason: reason,
        })
        .eq("student_id", studentId)
        .eq("date", date);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance-all"] });
      toast.success("Justificativa enviada com sucesso!");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Erro ao enviar justificativa.");
    },
  });
}
