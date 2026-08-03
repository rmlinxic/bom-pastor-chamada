import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Church, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import PasswordInput from "@/components/PasswordInput";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await login(username.trim(), password);
    if (error) {
      setError(error);
      setLoading(false);
    } else {
      navigate("/", { replace: true });
    }
  };

  return (
    <div className="public-shell">
      <div className="public-panel max-w-md">
        <div className="mb-8 flex flex-col items-center">
          <div className="brand-mark mb-5 h-20 w-20">
            <Church className="h-10 w-10" />
          </div>
          <p className="brand-kicker mb-2">Área do catequista</p>
          <h1 className="text-center text-3xl font-bold tracking-[-0.035em] text-foreground">Catequese Bom Pastor</h1>
          <p className="mt-2 text-center text-sm font-medium text-muted-foreground">Presença, cuidado e comunidade em um só lugar.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="username">Usuário</Label>
            <Input
              id="username"
              type="text"
              autoComplete="username"
              placeholder="Nome de usuário"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="h-12 text-base"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={64}
              required
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Senha</Label>
              <a
                href="#/esqueci-senha"
                className="text-xs text-primary hover:text-primary/80 underline underline-offset-2 transition-colors"
              >
                Esqueci minha senha
              </a>
            </div>
            <PasswordInput
              value={password}
              onChange={setPassword}
              placeholder="Sua senha"
              autoComplete="current-password"
              className="h-12 text-base"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
              <p className="text-sm text-destructive text-center font-medium">{error}</p>
            </div>
          )}

          <Button
            type="submit"
            className="w-full h-12 text-base font-semibold mt-2"
            disabled={loading || !username || !password}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground" />
                Entrando...
              </span>
            ) : (
              <>
                <LogIn className="h-4 w-4 mr-2" /> Entrar
              </>
            )}
          </Button>
        </form>

        <p className="mt-8 border-t border-border/70 pt-6 text-center text-xs text-muted-foreground">
          Você é pai ou responsável?{" "}
          <a
            href="#/justificativa"
            className="underline underline-offset-2 hover:text-foreground transition-colors"
          >
            Enviar justificativa de falta
          </a>
        </p>
      </div>
    </div>
  );
}
