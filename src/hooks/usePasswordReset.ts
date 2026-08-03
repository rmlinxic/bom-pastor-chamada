import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

/**
 * Solicita reset de senha por e-mail usando Supabase Auth
 */
export async function requestPasswordReset(email: string): Promise<{ error: string | null }> {
  try {
    // Verifica se o e-mail existe (silenciosamente)
    const { data } = await db
      .from("catequistas")
      .select("id")
      .eq("email", email.toLowerCase().trim())
      .eq("active", true)
      .maybeSingle();

    if (!data) {
      // Não revela se o e-mail existe ou não
      return { error: null };
    }

    const { error } = await supabase.auth.resetPasswordForEmail(
      email.toLowerCase().trim(),
      { redirectTo: window.location.origin + "/#/redefinir-senha" }
    );

    if (error) {
      console.error("Reset password error:", error);
      return { error: "Erro ao enviar e-mail. Tente novamente." };
    }

    return { error: null };
  } catch {
    return { error: "Erro inesperado. Tente novamente." };
  }
}

/**
 * Redefine a senha usando o hash SHA-256
 */
export async function confirmPasswordReset(
  email: string,
  newPasswordHash: string
): Promise<{ error: string | null }> {
  try {
    const { error } = await db.rpc("reset_password_by_email", {
      p_email: email.toLowerCase().trim(),
      p_new_password_hash: newPasswordHash,
    });

    if (error) {
      console.error("Confirm reset error:", error);
      return { error: "Erro ao redefinir senha. Tente novamente." };
    }

    return { error: null };
  } catch {
    return { error: "Erro inesperado. Tente novamente." };
  }
}
