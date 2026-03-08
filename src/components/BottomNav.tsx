import {
  Home,
  ClipboardCheck,
  Users,
  BarChart3,
  ShieldCheck,
  Church,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

/** 5 abas para catequistas (inclui Missas) */
const CATECHIST_TABS = [
  { path: "/", icon: Home, label: "Início" },
  { path: "/chamada", icon: ClipboardCheck, label: "Chamada" },
  { path: "/missas", icon: Church, label: "Missas" },
  { path: "/alunos", icon: Users, label: "Alunos" },
  { path: "/relatorios", icon: BarChart3, label: "Relatórios" },
];

/** 5 abas para admin (sem Missas no nav — compliance visível nos Relatórios) */
const ADMIN_TABS = [
  { path: "/", icon: Home, label: "Início" },
  { path: "/chamada", icon: ClipboardCheck, label: "Chamada" },
  { path: "/alunos", icon: Users, label: "Alunos" },
  { path: "/relatorios", icon: BarChart3, label: "Relatórios" },
  { path: "/admin", icon: ShieldCheck, label: "Admin" },
];

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const tabs = isAdmin ? ADMIN_TABS : CATECHIST_TABS;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card safe-bottom">
      <div className="mx-auto grid max-w-lg grid-cols-5 items-center">
        {tabs.map((tab) => {
          const active = location.pathname === tab.path;
          const isAdminTab = tab.path === "/admin";
          const isMissasTab = tab.path === "/missas";
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={cn(
                "flex flex-col items-center gap-0.5 py-3 text-xs transition-colors",
                active
                  ? isAdminTab
                    ? "text-warning font-semibold"
                    : isMissasTab
                    ? "text-primary font-semibold"
                    : "text-primary font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <tab.icon
                className={cn(
                  "h-6 w-6",
                  active && isAdminTab && "text-warning",
                  active && !isAdminTab && "text-primary"
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
