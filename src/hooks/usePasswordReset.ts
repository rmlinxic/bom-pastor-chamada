import { supabase } from "@/integrations/supabase/client";
import { assertPasswordProvided } from "@/lib/credentials";

/** Recovery by email is intentionally on standby until an email service exists. */
export async function requestPasswordReset(_email: string): Promise<{ error: string | null }> {
  return { error: "A recuperação por e-mail está em espera. Procure o administrador." };
}

export async function confirmPasswordReset(password: string, currentPassword?: string): Promise<{ error: string | null }> {
  try {
    assertPasswordProvided(password);
    const { data: { user }, error: identityError } = await supabase.auth.getUser();
    if (identityError || !user) return { error: "Entre na sua conta para alterar a senha." };
    const { data, error } = await supabase.functions.invoke("account-management", { body: { action: "set_password", password, ...(currentPassword ? { currentPassword } : {}) } });
    if (error) {
      if (error.context instanceof Response) {
        const result = await error.context.clone().json().catch(() => null);
        if (typeof result?.error === "string") return { error: result.error };
      }
      return { error: "Não foi possível alterar a senha. Confira sua senha atual e tente novamente." };
    }
    return { error: typeof data?.error === "string" ? data.error : null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível alterar a senha." };
  }
}
