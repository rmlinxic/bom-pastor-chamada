import { createContext, useContext, useState } from "react";

// Credenciais lidas dos env vars (definidos como GitHub Secrets)
// Em desenvolvimento local, configure o .env com essas variáveis
const ADMIN_USER = import.meta.env.VITE_ADMIN_USER ?? "ricardo";
const ADMIN_PASS = import.meta.env.VITE_ADMIN_PASSWORD ?? "";

const SESSION_KEY = "bom_pastor_auth_v1";

interface AuthContextType {
  isAuthenticated: boolean;
  login: (user: string, pass: string) => boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  login: () => false,
  logout: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => localStorage.getItem(SESSION_KEY) === "authenticated"
  );

  const login = (user: string, pass: string): boolean => {
    if (user === ADMIN_USER && pass === ADMIN_PASS) {
      localStorage.setItem(SESSION_KEY, "authenticated");
      setIsAuthenticated(true);
      return true;
    }
    return false;
  };

  const logout = () => {
    localStorage.removeItem(SESSION_KEY);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
