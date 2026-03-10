import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const db = supabase as any;

export interface Paroquia {
  id: string;
  nome: string;
  ativa: boolean;
  created_at: string;
}

export function useParoquias() {
  return useQuery({
    queryKey: ["paroquias"],
    queryFn: async () => {
      const { data, error } = await db
        .from("paroquias")
        .select("id, nome, ativa, created_at")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Paroquia[];
    },
  });
}

export function useCreateParoquia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (nome: string) => {
      const { error } = await db.from("paroquias").insert({ nome: nome.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["paroquias"] });
      toast.success("Paróquia criada com sucesso!");
    },
    onError: (err: Error) => {
      if (err.message?.includes("unique") || err.message?.includes("duplicate")) {
        toast.error("Já existe uma paróquia com esse nome.");
      } else {
        toast.error("Erro ao criar paróquia.");
      }
    },
  });
}

export function useToggleParoquia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ativa }: { id: string; ativa: boolean }) => {
      const { error } = await db
        .from("paroquias")
        .update({ ativa })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["paroquias"] });
      toast.success("Paróquia atualizada.");
    },
    onError: () => toast.error("Erro ao atualizar paróquia."),
  });
}
