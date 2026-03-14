import {
  Home,
  ClipboardCheck,
  Users,
  BarChart3,
  ShieldCheck,
  Church,
  Building2,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const CATECHIST_TABS = [
  { path: "/", icon: Home, label: "Início" },
  { path: "/chamada", icon: ClipboardCheck, label: "Chamada" },
  { path: "/missas", icon: Church, label: "Missas" },
  { path: "/alunos", icon: Users, label: "Catequizandos" },
  { path: "/relatorios", icon: BarChart3, label: "Relatórios" },
];

// Catequista que também é coordenador: todas as abas de catequista + aba da paróquia
const CATECHIST_COORD_TABS = [
  { path: "/", icon: Home, label: "Início" },
  { path: "/chamada", icon: ClipboardCheck, label: "Chamada" },
  { path: "/missas", icon: Church, label: "Missas" },
  { path: "/alunos", icon: Users, label: "Catequizandos" },
  { path: "/coordenador", icon: Building2, label: "Paróquia" },
  { path: "/relatorios", icon: BarChart3, label: "Relatórios" },
];

const ADMIN_TABS = [
  { path: "/", icon: Home, label: "Início" },
  { path: "/chamada", icon: ClipboardCheck, label: "Chamada" },
  { path: "/alunos", icon: Users, label: "Catequizandos" },
  { path: "/relatorios", icon: BarChart3, label: "Relatórios" },
  { path: "/admin", icon: ShieldCheck, label: "Admin" },
];

const COORDINATOR_TABS = [
  { path: "/", icon: Home, label: "Início" },
  { path: "/coordenador", icon: Building2, label: "Paróquia" },
  { path: "/relatorios", icon: BarChart3, label: "Relatórios" },
];

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAdmin, isCoordinator, isCatequista } = useAuth();

  // Determina o conjunto de abas correto
  let tabs;
  if (isAdmin) {
    tabs = ADMIN_TABS;
  } else if (isCatequista && isCoordinator) {
    // Catequista que também coordena: abas completas
    tabs = CATECHIST_COORD_TABS;
  } else if (isCoordinator) {
    // Coordenador puro: apenas abas de coordenador
    tabs = COORDINATOR_TABS;
  } else {
    tabs = CATECHIST_TABS;
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card safe-bottom">
      <div
        className="mx-auto grid max-w-lg items-center"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map((tab) => {
          const active = location.pathname === tab.path;
          const isAdminTab = tab.path === "/admin";
          const isCoordTab = tab.path === "/coordenador";
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={cn(
                "flex flex-col items-center gap-0.5 py-3 text-xs transition-colors",
                active
                  ? isAdminTab
                    ? "text-warning font-semibold"
                    : isCoordTab
                    ? "text-secondary-foreground font-semibold"
                    : "text-primary font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <tab.icon
                className={cn(
                  "h-6 w-6",
                  active && isAdminTab && "text-warning",
                  active && isCoordTab && "text-secondary-foreground",
                  active && !isAdminTab && !isCoordTab && "text-primary"
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
