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
  username: string;
  role: "admin" | "catequista" | "coordenador";
  etapa: string | null;
  paroquia_id: string | null;
  paroquia_nome: string | null;
  active: boolean;
  created_at: string;
}

export function useCatequistas() {
  return useQuery({
    queryKey: ["catequistas"],
    queryFn: async () => {
      const { data, error } = await db
        .from("catequistas")
        .select("id, name, username, role, etapa, paroquia_id, active, created_at, paroquias(nome)")
        .order("created_at");
      if (error) throw error;
      return ((data ?? []) as any[]).map((c) => ({
        ...c,
        paroquia_nome: c.paroquias?.nome ?? null,
      })) as Catequista[];
    },
  });
}

export function useCatequistasByParoquia(paroquia_id: string | null) {
  return useQuery({
    queryKey: ["catequistas", "paroquia", paroquia_id],
    enabled: !!paroquia_id,
    queryFn: async () => {
      const { data, error } = await db
        .from("catequistas")
        .select("id, name, username, role, etapa, paroquia_id, active, created_at, paroquias(nome)")
        .eq("paroquia_id", paroquia_id)
        .eq("active", true)
        .order("created_at");
      if (error) throw error;
      return ((data ?? []) as any[]).map((c) => ({
        ...c,
        paroquia_nome: c.paroquias?.nome ?? null,
      })) as Catequista[];
    },
  });
}

export function useCreateCatequista() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      username: string;
      password: string;
      etapa: string | null;
      role: "admin" | "catequista" | "coordenador";
      paroquia_id: string | null;
    }) => {
      const password_hash = await hashPassword(input.password);
      const { error } = await db.from("catequistas").insert({
        name: input.name.trim(),
        username: input.username.toLowerCase().trim(),
        password_hash,
        etapa: input.role === "catequista" ? (input.etapa?.trim() || null) : null,
        role: input.role,
        paroquia_id: input.paroquia_id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["catequistas"] });
      toast.success("Usuário criado com sucesso!");
    },
    onError: (err: Error) => {
      if (err.message?.includes("unique") || err.message?.includes("duplicate")) {
        toast.error("Já existe um usuário com esse nome de usuário.");
      } else {
        toast.error("Erro ao criar usuário.");
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
      username: string;
      newPassword?: string;
      etapa: string | null;
      role: "admin" | "catequista" | "coordenador";
      paroquia_id: string | null;
    }) => {
      const update: Record<string, unknown> = {
        name: input.name.trim(),
        username: input.username.toLowerCase().trim(),
        etapa: input.role === "catequista" ? (input.etapa?.trim() || null) : null,
        role: input.role,
        paroquia_id: input.paroquia_id || null,
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
      toast.success("Usuário atualizado!");
    },
    onError: () => toast.error("Erro ao atualizar usuário."),
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
      toast.success("Usuário removido.");
    },
    onError: () => toast.error("Erro ao remover usuário."),
  });
}
