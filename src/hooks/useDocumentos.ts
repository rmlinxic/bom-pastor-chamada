import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useStudents } from "@/hooks/useStudents";

const db = supabase as any;

export type DocumentosRecord = {
  id: string;
  student_id: string;
  batismo: boolean;
  endereco: boolean;
  crisma_padrinho: boolean;
  primeira_comunhao: boolean;
  updated_at: string;
};

/** Retorna todos os registros de documentos visíveis ao usuário logado */
export function useAllDocumentos() {
  const { user, isAdmin, isCoordinator } = useAuth();
  const { data: students = [], isSuccess: studentsLoaded } = useStudents();
  const studentIds = students.map((student) => student.id as string);
  return useQuery({
    queryKey: ["documentos", user?.id, user?.etapa, user?.paroquia_id, isCoordinator, isAdmin, studentIds],
    queryFn: async () => {
      if (!user || (!isAdmin && studentIds.length === 0)) return [];
      let query = db.from("documentos_catequizando").select("*");
      if (!isAdmin) query = query.in("student_id", studentIds);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as DocumentosRecord[];
    },
    enabled: !!user && (isAdmin || studentsLoaded),
  });
}

/** Retorna o registro de documentos de um catequizando específico */
export function useDocumentosStudent(studentId: string | null) {
  const { user, isAdmin, isCoordinator } = useAuth();
  const { data: students = [], isSuccess: studentsLoaded } = useStudents();
  const visible = isAdmin || students.some((student) => student.id === studentId);
  return useQuery({
    queryKey: ["documentos-student", studentId, user?.id, user?.etapa, user?.paroquia_id, isCoordinator, isAdmin, visible],
    queryFn: async () => {
      if (!user || !visible) return null;
      const { data, error } = await db
        .from("documentos_catequizando")
        .select("*")
        .eq("student_id", studentId!)
        .maybeSingle();
      if (error) throw error;
      return data as DocumentosRecord | null;
    },
    enabled: !!user && !!studentId && (isAdmin || studentsLoaded),
  });
}

/** Salva (upsert) os documentos de um catequizando */
export function useSaveDocumentos() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      student_id: string;
      batismo: boolean;
      endereco: boolean;
      crisma_padrinho: boolean;
      primeira_comunhao: boolean;
    }) => {
      const { error } = await db
        .from("documentos_catequizando")
        .upsert(
          {
            ...payload,
            updated_by: user?.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "student_id" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documentos"] });
      queryClient.invalidateQueries({ queryKey: ["documentos-student"] });
      queryClient.invalidateQueries({ queryKey: ["pending-center"] });
      toast.success("Documentos atualizados!");
    },
    onError: () => toast.error("Erro ao salvar documentos."),
  });
}
