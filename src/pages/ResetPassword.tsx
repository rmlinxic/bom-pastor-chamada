import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, ArrowLeft, Loader2, ShieldCheck, CheckCircle, Church } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { confirmPasswordReset } from "@/hooks/usePasswordReset";
import { toast } from "sonner";
import { checkPasswordStrength } from "@/lib/security";

const SALT = "bom_pastor_catequese";

async function hashPassword(password: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(SALT + password));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [isCheckingMode, setIsCheckingMode] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    // Check initial session (user may have already landed with a recovery token)
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUserEmail(session.user.email || null);
        setIsRecoveryMode(true);
      }
      setIsCheckingMode(false);
    };

    checkSession();

    // Listen for PASSWORD_RECOVERY event from Supabase Auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setIsRecoveryMode(true);
        setUserEmail(session?.user?.email || null);
        setIsCheckingMode(false);
      }
    });

    // Fallback: stop showing loader after 3s
    const timer = setTimeout(() => {
      setIsCheckingMode(false);
    }, 3000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password || password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (password !== confirmPwd) {
      toast.error("As senhas não coincidem.");
      return;
    }
    if (!userEmail) {
      toast.error("Não foi possível identificar o usuário. Tente novamente.");
      return;
    }

    setIsLoading(true);
    try {
      const hash = await hashPassword(password);
      const { error } = await confirmPasswordReset(userEmail, hash);

      if (error) {
        toast.error(error);
      } else {
        toast.success("Senha redefinida com sucesso!");
        await supabase.auth.signOut();
        navigate("/login");
      }
    } catch {
      toast.error("Ocorreu um erro ao redefinir a senha.");
    } finally {
      setIsLoading(false);
    }
  };

  const strength = password ? checkPasswordStrength(password) : null;
  const passwordsMatch = password && confirmPwd && password === confirmPwd;
  const passwordsMismatch = password && confirmPwd && password !== confirmPwd;

  // ─── Estado: verificando token ───
  if (isCheckingMode) {
    return (
      <div className="public-shell">
        <div className="public-panel flex max-w-sm flex-col items-center gap-4 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            Verificando link de redefinição...
          </p>
        </div>
      </div>
    );
  }

  // ─── Estado: link inválido/expirado ───
  if (!isRecoveryMode) {
    return (
      <div className="public-shell">
        <div className="public-panel max-w-md">
          <div className="mb-8 flex flex-col items-center">
            <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-destructive/10 shadow-sm">
              <Church className="h-10 w-10 text-destructive" />
            </div>
            <p className="brand-kicker mb-2">Catequese Bom Pastor</p>
            <h1 className="text-center text-3xl font-bold tracking-[-0.035em] text-foreground">
              Link Inválido
            </h1>
            <p className="text-sm text-muted-foreground text-center mt-1">
              O link de redefinição expirou ou é inválido
            </p>
          </div>

          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 mb-6">
            <p className="text-sm text-destructive text-center font-medium">
              Link inválido ou expirado. Solicite um novo link de redefinição.
            </p>
          </div>

          <div className="flex flex-col items-center gap-3">
            <a
              href="#/esqueci-senha"
              className="text-sm font-medium text-primary hover:text-primary/80 underline underline-offset-2 transition-colors"
            >
              Solicitar novo link
            </a>
            <a
              href="#/login"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3 w-3" />
              Voltar para o login
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ─── Estado: formulário de redefinição ───
  return (
    <div className="public-shell">
      <div className="public-panel max-w-md">
        <div className="mb-8 flex flex-col items-center">
          <div className="brand-mark mb-5 h-20 w-20">
            <KeyRound className="h-10 w-10" />
          </div>
          <p className="brand-kicker mb-2">Catequese Bom Pastor</p>
          <h1 className="text-center text-3xl font-bold tracking-[-0.035em] text-foreground">
            Redefinir Senha
          </h1>
          <p className="text-sm text-muted-foreground text-center mt-1">
            Crie uma nova senha para sua conta
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nova senha */}
          <div className="space-y-1.5">
            <Label htmlFor="password">Nova senha</Label>
            <div className="relative">
              <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                required
                className="h-12 text-base pl-10"
                placeholder="Mínimo 6 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                minLength={6}
              />
            </div>
            {strength && (
              <div className="space-y-1.5 mt-1.5">
                <div className="flex gap-1">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-1.5 flex-1 rounded-full transition-colors"
                      style={{
                        backgroundColor:
                          i <= strength.score
                            ? strength.score <= 1
                              ? "hsl(var(--destructive))"
                              : strength.score <= 2
                              ? "hsl(40 96% 53%)"
                              : "hsl(142 76% 36%)"
                            : "hsl(var(--muted))",
                      }}
                    />
                  ))}
                </div>
                <p className={`text-xs ${strength.color}`}>
                  {strength.label}
                </p>
              </div>
            )}
          </div>

          {/* Confirmar senha */}
          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
            <div className="relative">
              <CheckCircle className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="confirmPassword"
                type="password"
                required
                className="h-12 text-base pl-10"
                placeholder="Repita a nova senha"
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                disabled={isLoading}
                minLength={6}
              />
            </div>
            {passwordsMismatch && (
              <p className="text-xs text-destructive mt-1">
                As senhas não coincidem.
              </p>
            )}
            {passwordsMatch && (
              <p className="text-xs text-success mt-1 flex items-center gap-1">
                <CheckCircle className="h-3 w-3" />
                Senhas coincidem
              </p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full h-12 text-base font-semibold mt-2"
            disabled={
              isLoading ||
              password.length < 6 ||
              password !== confirmPwd
            }
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Salvando...
              </span>
            ) : (
              <>
                <KeyRound className="h-4 w-4 mr-2" /> Redefinir senha
              </>
            )}
          </Button>

          <p className="text-xs text-center text-muted-foreground mt-6">
            <a
              href="#/login"
              className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3 w-3" />
              Voltar para o login
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}
