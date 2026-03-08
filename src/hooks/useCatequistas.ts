import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const db = supabase as any;
const SALT = "bom_pastor_catequese";

export async function hashPassword(password: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(SALT + password));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface Catequista {
  id: string;
  name: string;
  email: string;
  role: "admin" | "catequista";
  etapa: string | null;
  active: boolean;
  created_at: string;
}

export function useCatequistas() {
  return useQuery({
    queryKey: ["catequistas"],
    queryFn: async () => {
      const { data, error } = await db
        .from("catequistas")
        .select("id, name, email, role, etapa, active, created_at")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as Catequista[];
    },
  });
}

export function useCreateCatequista() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      email: string;
      password: string;
      etapa: string | null;
      role: "admin" | "catequista";
    }) => {
      const password_hash = await hashPassword(input.password);
      const { error } = await db.from("catequistas").insert({
        name: input.name.trim(),
        email: input.email.toLowerCase().trim(),
        password_hash,
        etapa: input.etapa?.trim() || null,
        role: input.role,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["catequistas"] });
      toast.success("Catequista criado com sucesso!");
    },
    onError: (err: Error) => {
      if (err.message?.includes("unique") || err.message?.includes("duplicate")) {
        toast.error("Já existe um catequista com esse e-mail.");
      } else {
        toast.error("Erro ao criar catequista.");
      }
    },
  });
}

export function useUpdateCatequista() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      name: string;
      email: string;
      newPassword?: string;
      etapa: string | null;
      role: "admin" | "catequista";
    }) => {
      const update: Record<string, unknown> = {
        name: input.name.trim(),
        email: input.email.toLowerCase().trim(),
        etapa: input.etapa?.trim() || null,
        role: input.role,
      };
      if (input.newPassword) {
        update.password_hash = await hashPassword(input.newPassword);
      }
      const { error } = await db
        .from("catequistas")
        .update(update)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["catequistas"] });
      toast.success("Catequista atualizado!");
    },
    onError: () => toast.error("Erro ao atualizar catequista."),
  });
}

export function useDeactivateCatequista() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db
        .from("catequistas")
        .update({ active: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["catequistas"] });
      toast.success("Catequista removido.");
    },
    onError: () => toast.error("Erro ao remover catequista."),
  });
}
