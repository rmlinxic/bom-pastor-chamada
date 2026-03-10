import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  isLockedOut, recordFailedAttempt, clearRateLimit, formatLockoutTime,
  initSessionMeta, touchSession, isSessionExpired, clearSessionMeta,
  sanitizeUsername,
} from "@/lib/security";

const SALT = "bom_pastor_catequese";
const SESSION_KEY = "bom_pastor_session_v3";
const db = supabase as any;

async function hashPassword(password: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(SALT + password));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface CatequistaUser {
  id: string;
  name: string;
  username: string;
  role: "admin" | "catequista" | "coordenador";
  etapa: string | null;
  paroquia_id: string | null;
  paroquia_nome: string | null;
  is_coordenador: boolean;
}

interface AuthContextType {
  user: CatequistaUser | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isCoordinator: boolean;
  isCatequista: boolean;
  login: (username: string, password: string) => Promise<{ error: string | null }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  isAdmin: false,
  isCoordinator: false,
  isCatequista: false,
  login: async () => ({ error: null }),
  logout: () => {},
});

function loadSession(): CatequistaUser | null {
  try {
    // Sessão expirada? limpa e retorna null
    if (isSessionExpired()) {
      localStorage.removeItem(SESSION_KEY);
      clearSessionMeta();
      return null;
    }
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as CatequistaUser) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CatequistaUser | null>(loadSession);

  // ── Verifica expiração a cada 60s e no foco da janela ──
  useEffect(() => {
    if (!user) return;

    const check = () => {
      if (isSessionExpired()) {
        localStorage.removeItem(SESSION_KEY);
        clearSessionMeta();
        setUser(null);
      }
    };

    const interval = setInterval(check, 60_000);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", check);
    };
  }, [user]);

  // ── Atualiza lastActivity em qualquer interação ──
  useEffect(() => {
    if (!user) return;
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    const handler = () => touchSession();
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, handler));
  }, [user]);

  const login = useCallback(
    async (username: string, password: string): Promise<{ error: string | null }> => {
      const cleanUsername = sanitizeUsername(username);

      if (!cleanUsername || !password) {
        return { error: "Preencha usuário e senha." };
      }

      // ── Rate limiting ──
      const lockStatus = isLockedOut(cleanUsername);
      if (lockStatus.locked) {
        return {
          error: `Muitas tentativas. Tente novamente em ${formatLockoutTime(lockStatus.remainingMs)}.`,
        };
      }

      // ── Tamanho máximo de senha (evita DoS por hash de string gigante) ──
      if (password.length > 128) {
        return { error: "Senha inválida." };
      }

      const hash = await hashPassword(password);

      const { data, error } = await db
        .from("catequistas")
        .select("id, name, username, role, etapa, paroquia_id, is_coordenador, paroquias(nome)")
        .eq("username", cleanUsername)
        .eq("password_hash", hash)
        .eq("active", true)
        .maybeSingle();

      if (error) {
        if (error.code === "42P01")
          return { error: "Sistema não configurado. Execute a migração SQL no Supabase." };
        return { error: "Erro ao acessar o banco de dados." };
      }

      if (!data) {
        // Registra tentativa falha (independente de username existir ou não)
        const entry = recordFailedAttempt(cleanUsername);
        const remaining = 5 - entry.attempts;
        if (entry.lockedUntil) {
          return { error: `Conta bloqueada por ${formatLockoutTime(LOCKOUT_MS_CONST)}. Muitas tentativas.` };
        }
        return {
          error: remaining > 0
            ? `Usuário ou senha incorretos. ${remaining} tentativa${remaining !== 1 ? "s" : ""} restante${remaining !== 1 ? "s" : ""}.`
            : "Usuário ou senha incorretos.",
        };
      }

      // ── Sucesso: limpa rate limit e inicia sessão ──
      clearRateLimit(cleanUsername);
      initSessionMeta();

      const sessionUser: CatequistaUser = {
        id: data.id,
        name: data.name,
        username: data.username,
        role: data.role,
        etapa: data.etapa ?? null,
        paroquia_id: data.paroquia_id ?? null,
        paroquia_nome: data.paroquias?.nome ?? null,
        is_coordenador: data.is_coordenador ?? false,
      };

      localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser));
      setUser(sessionUser);
      return { error: null };
    },
    []
  );

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    clearSessionMeta();
    setUser(null);
  }, []);

  const isCoordinator = user?.role === "coordenador" || user?.is_coordenador === true;
  const isCatequista = user?.role === "catequista";

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isAdmin: user?.role === "admin",
        isCoordinator,
        isCatequista,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

const LOCKOUT_MS_CONST = 15 * 60 * 1000;

export function useAuth() {
  return useContext(AuthContext);
}
