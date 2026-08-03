import { useState } from "react";
import { Church, Mail, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset } from "@/hooks/usePasswordReset";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setError("");
    setIsLoading(true);
    try {
      const { error } = await requestPasswordReset(email);
      if (error) {
        setError(error);
      } else {
        setIsSuccess(true);
      }
    } catch {
      setError("Ocorreu um erro ao processar sua solicitação.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-8">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-10">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 mb-4">
            {isSuccess ? (
              <Mail className="h-10 w-10 text-primary" />
            ) : (
              <Church className="h-10 w-10 text-primary" />
            )}
          </div>
          <h1 className="text-2xl font-bold text-foreground text-center">
            {isSuccess ? "E-mail Enviado" : "Esqueci minha senha"}
          </h1>
          <p className="text-sm text-muted-foreground text-center mt-1 max-w-xs">
            {isSuccess
              ? "Verifique sua caixa de entrada e a pasta de spam"
              : "Informe seu e-mail cadastrado para receber o link de redefinição"}
          </p>
        </div>

        {isSuccess ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
              <p className="text-sm text-foreground text-center">
                Se o e-mail estiver cadastrado, você receberá um link de
                redefinição em instantes.
              </p>
            </div>

            <a
              href="#/login"
              className="flex items-center justify-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors mt-6"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar para o login
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="h-12 text-base pl-10"
                  placeholder="seu.email@exemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                />
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
                <p className="text-sm text-destructive text-center font-medium">
                  {error}
                </p>
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-12 text-base font-semibold mt-2"
              disabled={isLoading || !email}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enviando...
                </span>
              ) : (
                <>
                  <Mail className="h-4 w-4 mr-2" /> Enviar link de redefinição
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
        )}
      </div>
    </div>
  );
}
