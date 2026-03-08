import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Church, Eye, EyeOff, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
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
          <h1 className="text-2xl font-bold text-foreground text-center">
            Bom Pastor
          </h1>
          <p className="text-sm text-muted-foreground text-center mt-1">
            Sistema de Chamada
          </p>
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
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Senha</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPass ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Sua senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 text-base pr-12"
                required
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
                tabIndex={-1}
                aria-label={showPass ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPass ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive text-center font-medium animate-fade-in">
              {error}
            </p>
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
                <LogIn className="h-4 w-4 mr-2" />
                Entrar
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
