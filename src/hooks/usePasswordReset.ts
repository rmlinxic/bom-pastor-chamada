import { supabase } from "@/integrations/supabase/client";
import { assertPasswordProvided } from "@/lib/credentials";

/** Auth supplies rate limiting and a verified email link; no public account lookup. */
export async function requestPasswordReset(email: string): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: new URL(`${import.meta.env.BASE_URL}#/redefinir-senha`, window.location.origin).href,
    });
    return { error: error ? "Não foi possível solicitar o e-mail. Aguarde e tente novamente." : null };
  } catch {
    return { error: "Não foi possível solicitar o e-mail. Tente novamente." };
  }
}

export async function confirmPasswordReset(newPassword: string): Promise<{ error: string | null }> {
  try {
    assertPasswordProvided(newPassword);
    const { data: { user }, error: identityError } = await supabase.auth.getUser();
    if (identityError || !user) return { error: "O link expirou. Solicite um novo e-mail." };
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error: error ? error.message : null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível alterar a senha." };
  }
}
