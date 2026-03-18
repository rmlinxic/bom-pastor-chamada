import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

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
  const { user } = useAuth();
  return useQuery({
    queryKey: ["documentos", user?.id],
    queryFn: async () => {
      const { data, error } = await db
        .from("documentos_catequizando")
        .select("*");
      if (error) throw error;
      return (data ?? []) as DocumentosRecord[];
    },
    enabled: !!user,
  });
}

/** Retorna o registro de documentos de um catequizando específico */
export function useDocumentosStudent(studentId: string | null) {
  return useQuery({
    queryKey: ["documentos-student", studentId],
    queryFn: async () => {
      const { data, error } = await db
        .from("documentos_catequizando")
        .select("*")
        .eq("student_id", studentId!)
        .maybeSingle();
      if (error) throw error;
      return data as DocumentosRecord | null;
    },
    enabled: !!studentId,
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
      toast.success("Documentos atualizados!");
    },
    onError: () => toast.error("Erro ao salvar documentos."),
  });
}
