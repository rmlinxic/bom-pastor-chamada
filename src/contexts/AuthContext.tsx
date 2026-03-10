import { createContext, useContext, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

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
  /** true se role=coordenador OU se catequista com is_coordenador=true */
  isCoordinator: boolean;
  /** true se tem role=catequista (independente de ser coordenador também) */
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
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as CatequistaUser) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CatequistaUser | null>(loadSession);

  const login = useCallback(
    async (username: string, password: string): Promise<{ error: string | null }> => {
      const hash = await hashPassword(password);

      const { data, error } = await db
        .from("catequistas")
        .select("id, name, username, role, etapa, paroquia_id, is_coordenador, paroquias(nome)")
        .eq("username", username.toLowerCase().trim())
        .eq("password_hash", hash)
        .eq("active", true)
        .maybeSingle();

      if (error) {
        if (error.code === "42P01")
          return { error: "Sistema não configurado. Execute a migração SQL no Supabase." };
        return { error: "Erro ao acessar o banco de dados." };
      }

      if (!data) return { error: "Usuário ou senha incorretos." };

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

export function useAuth() {
  return useContext(AuthContext);
}
