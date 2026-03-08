import { Home, ClipboardCheck, Users, BarChart3, ShieldCheck } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const BASE_TABS = [
  { path: "/", icon: Home, label: "Início" },
  { path: "/chamada", icon: ClipboardCheck, label: "Chamada" },
  { path: "/alunos", icon: Users, label: "Alunos" },
  { path: "/relatorios", icon: BarChart3, label: "Relatórios" },
];

const ADMIN_TAB = { path: "/admin", icon: ShieldCheck, label: "Admin" };

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const tabs = isAdmin ? [...BASE_TABS, ADMIN_TAB] : BASE_TABS;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card safe-bottom">
      <div
        className={cn(
          "mx-auto flex max-w-lg items-center justify-around",
          isAdmin ? "grid grid-cols-5" : "flex"
        )}
      >
        {tabs.map((tab) => {
          const active = location.pathname === tab.path;
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-3 text-xs transition-colors",
                active
                  ? tab.path === "/admin"
                    ? "text-warning font-semibold"
                    : "text-primary font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <tab.icon
                className={cn(
                  "h-6 w-6",
                  active && tab.path === "/admin" && "text-warning",
                  active && tab.path !== "/admin" && "text-primary"
                )}
              />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
