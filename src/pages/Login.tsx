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
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-8">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-10">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 mb-4">
            <Church className="h-10 w-10 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground text-center">Bom Pastor</h1>
          <p className="text-sm text-muted-foreground text-center mt-1">Sistema de Chamada</p>
          <span className="mt-2 rounded-full bg-primary/10 px-3 py-0.5 text-xs font-medium text-primary">
            Área do Catequista
          </span>
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
            <Label htmlFor="password">Senha</Label>
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

        <p className="text-xs text-center text-muted-foreground mt-10">
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
