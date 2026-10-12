import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase, isAuthCallback } from "@/integrations/supabase/client";
import { initSessionMeta, touchSession, isSessionExpired, clearSessionMeta } from "@/lib/security";

const db = supabase as any;

export interface CatequistaUser {
  id: string;
  name: string;
  username: string;
  role: "admin" | "catequista" | "coordenador";
  etapa: string | null;
  paroquia_id: string | null;
  paroquia_nome: string | null;
  is_coordenador: boolean;
  monitorar_missas: boolean;
}

interface AuthContextType {
  user: CatequistaUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isCoordinator: boolean;
  isCatequista: boolean;
  login: (username: string, password: string) => Promise<{ error: string | null }>;
  setMassMonitoring: (enabled: boolean) => Promise<{ error: string | null }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function readProfile(authUserId: string): Promise<CatequistaUser | null> {
  const { data, error } = await db.from("catequistas")
    .select("id, name, username, role, etapa, paroquia_id, is_coordenador, monitorar_missas, paroquias(nome)")
    .eq("auth_user_id", authUserId).eq("active", true).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { ...data, paroquia_nome: data.paroquias?.nome ?? null,
    is_coordenador: data.is_coordenador === true, monitorar_missas: data.monitorar_missas !== false };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<CatequistaUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const sequence = useRef(0);
  const signingIn = useRef(false);
  const loginAttempt = useRef(0);

  const logout = useCallback(() => {
    loginAttempt.current++;
    sequence.current++;
    setUser(null);
    clearSessionMeta();
    queryClient.clear();
    // Local state is cleared immediately, even when the network is unavailable.
    void supabase.auth.signOut({ scope: "local" });
  }, [queryClient]);

  useEffect(() => {
    let disposed = false;
    const refresh = async (newSignIn = false) => {
      const request = ++sequence.current;
      try {
        const { data: { user: identity }, error } = await supabase.auth.getUser();
        if (error || !identity) {
          if (!disposed && request === sequence.current) { setUser(null); queryClient.clear(); }
          return;
        }
        if (newSignIn) initSessionMeta();
        else if (isSessionExpired()) { if (!disposed && request === sequence.current) logout(); return; }
        const profile = await readProfile(identity.id);
        if (!disposed && request === sequence.current) setUser(profile);
      } catch {
        if (!disposed && request === sequence.current) { setUser(null); queryClient.clear(); }
      } finally {
        if (!disposed && request === sequence.current) setIsLoading(false);
      }
    };
    // Never await another Auth call inside onAuthStateChange's lock.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        loginAttempt.current++;
        sequence.current++; setUser(null); setIsLoading(false); clearSessionMeta(); queryClient.clear();
      } else if (session) {
        if (event === "SIGNED_IN" && signingIn.current) return;
        const newSession = signingIn.current || event === "PASSWORD_RECOVERY" || (event === "INITIAL_SESSION" && isAuthCallback);
        const queuedSequence = sequence.current;
        window.setTimeout(() => { if (!disposed && queuedSequence === sequence.current) void refresh(newSession); }, 0);
      } else if (event === "INITIAL_SESSION") {
        setIsLoading(false);
      }
    });
    // Clear obsolete client-controlled identity; it never grants access.
    localStorage.removeItem("bom_pastor_session_v3");
    return () => { disposed = true; subscription.unsubscribe(); };
  }, [logout, queryClient]);

  useEffect(() => {
    if (!user) return;
    const check = () => { if (isSessionExpired()) logout(); };
    const activity = () => {
      if (isSessionExpired()) logout();
      else touchSession();
    };
    const events = ["pointerdown", "keydown", "scroll", "touchstart"];
    const timer = window.setInterval(check, 30_000);
    window.addEventListener("focus", check);
    events.forEach((event) => window.addEventListener(event, activity, { capture: true, passive: true }));
    return () => {
      window.clearInterval(timer); window.removeEventListener("focus", check);
      events.forEach((event) => window.removeEventListener(event, activity, true));
    };
  }, [user, logout]);

  const login = useCallback(async (username: string, password: string) => {
    const attempt = ++loginAttempt.current;
    signingIn.current = true;
    try {
      const { data: tokens, error: loginError } = await supabase.functions.invoke("staff-login", { body: { username: username.trim().toLowerCase(), password } });
      if (loginError || typeof tokens?.access_token !== "string" || typeof tokens?.refresh_token !== "string") return { error: "Usuário ou senha incorretos, ou limite de tentativas atingido." };
      if (attempt !== loginAttempt.current) return { error: "A tentativa de login foi cancelada." };
      const { data, error } = await supabase.auth.setSession({ access_token: tokens.access_token, refresh_token: tokens.refresh_token });
      if (error || !data.user) return { error: "Não foi possível verificar sua sessão." };
      const profile = await readProfile(data.user.id);
      if (attempt !== loginAttempt.current) return { error: "A tentativa de login foi cancelada." };
      if (!profile) {
        logout();
        return { error: "Sua conta ainda não está autorizada. Entre em contato com a coordenação." };
      }
      initSessionMeta(); queryClient.clear(); setUser(profile);
      return { error: null };
    } catch {
      if (attempt === loginAttempt.current) logout();
      return { error: "Não foi possível entrar. Tente novamente." };
    } finally {
      signingIn.current = false;
    }
  }, [logout, queryClient]);

  const setMassMonitoring = useCallback(async (enabled: boolean) => {
    if (!user || user.role !== "catequista") return { error: "Preferência disponível apenas para catequistas." };
    const { error } = await supabase.functions.invoke("account-management", { body: { action: "set_mass_monitoring", enabled } });
    if (error) return { error: "Não foi possível atualizar o monitoramento de missas." };
    setUser((current) => current ? { ...current, monitorar_missas: enabled } : null);
    return { error: null };
  }, [user]);

  return <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user,
    isAdmin: user?.role === "admin", isCoordinator: user?.role === "coordenador" || user?.is_coordenador === true,
    isCatequista: user?.role === "catequista", login, setMassMonitoring, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return context;
}
