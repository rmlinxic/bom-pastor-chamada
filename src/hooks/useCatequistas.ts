import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { assertPasswordProvided } from "@/lib/credentials";

const db = supabase as any;
function optionalEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase() ?? "";
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error("Informe um e-mail de contato válido ou deixe em branco.");
  }
  return email;
}

async function manageAccount(body: Record<string, unknown>): Promise<void> {
  const { data, error } = await supabase.functions.invoke("account-management", { body });
  if (error) {
    if (error.context instanceof Response) {
      const result = await error.context.clone().json().catch(() => null);
      if (typeof result?.error === "string") throw new Error(result.error);
    }
    throw new Error("Não foi possível concluir a operação. Verifique sua sessão e tente novamente.");
  }
  if (typeof data?.error === "string") throw new Error(data.error);
}

function invalidateAccounts(qc: ReturnType<typeof useQueryClient>) {
  for (const key of ["catequistas", "catequistas-paroquia", "students", "dashboard-stats", "coord-stats"]) {
    qc.invalidateQueries({ queryKey: [key] });
  }
}

export interface Catequista {
  id: string;
  auth_user_id: string | null;
  name: string;
  username: string;
  email: string | null;
  role: "admin" | "catequista" | "coordenador";
  etapa: string | null;
  paroquia_id: string | null;
  paroquia_nome: string | null;
  is_coordenador: boolean;
  active: boolean;
  created_at: string;
}

export function useCatequistas() {
  return useQuery({
    queryKey: ["catequistas"],
    queryFn: async () => {
      const { data, error } = await db
        .from("catequistas")
        .select("id, auth_user_id, name, username, email, role, etapa, paroquia_id, is_coordenador, active, created_at, paroquias(nome)")
        .order("created_at");
      if (error) throw error;
      return ((data ?? []) as any[]).map((c) => ({
        ...c,
        paroquia_nome: c.paroquias?.nome ?? null,
        is_coordenador: c.is_coordenador ?? false,
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
        .select("id, auth_user_id, name, username, email, role, etapa, paroquia_id, is_coordenador, active, created_at, paroquias(nome)")
        .eq("paroquia_id", paroquia_id)
        .eq("active", true)
        .order("created_at");
      if (error) throw error;
      return ((data ?? []) as any[]).map((c) => ({
        ...c,
        paroquia_nome: c.paroquias?.nome ?? null,
        is_coordenador: c.is_coordenador ?? false,
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
      password?: string;
      email?: string | null;
      etapa: string | null;
      role: "admin" | "catequista" | "coordenador";
      paroquia_id: string | null;
      is_coordenador: boolean;
    }) => {
      assertPasswordProvided(input.password ?? "");
      await manageAccount({
        action: "create",
        ...input,
        name: input.name.trim(),
        username: input.username.toLowerCase().trim(),
        email: optionalEmail(input.email),
      });
    },
    onSuccess: () => {
      invalidateAccounts(qc);
      toast.success("Usuário criado com sucesso!");
    },
    onError: (err: Error) => toast.error(err.message || "Erro ao criar usuário."),
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
      email?: string | null;
      etapa: string | null;
      role: "admin" | "catequista" | "coordenador";
      paroquia_id: string | null;
      is_coordenador: boolean;
    }) => {
      if (input.newPassword) assertPasswordProvided(input.newPassword);
      await manageAccount({
        action: "update",
        ...input,
        name: input.name.trim(),
        username: input.username.toLowerCase().trim(),
        email: optionalEmail(input.email),
      });
    },
    onSuccess: () => {
      invalidateAccounts(qc);
      toast.success("Usuário atualizado!");
    },
    onError: (err: Error) => toast.error(err.message || "Erro ao atualizar usuário."),
  });
}

export function useDeactivateCatequista() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await manageAccount({ action: "deactivate", id });
    },
    onSuccess: () => {
      invalidateAccounts(qc);
      toast.success("Usuário removido.");
    },
    onError: (err: Error) => toast.error(err.message || "Erro ao remover usuário."),
  });
}
