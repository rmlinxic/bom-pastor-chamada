import {
  Home,
  ClipboardCheck,
  Users,
  BarChart3,
  ShieldCheck,
  Church,
  Building2,
  CalendarDays,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const CATECHIST_TABS = [
  { path: "/", icon: Home, label: "Início" },
  { path: "/chamada", icon: ClipboardCheck, label: "Chamada" },
  { path: "/missas", icon: Church, label: "Missas" },
  { path: "/alunos", icon: Users, label: "Catequizandos" },
  { path: "/calendario", icon: CalendarDays, label: "Calendário" },
  { path: "/relatorios", icon: BarChart3, label: "Relatórios" },
];

// Catequista que também é coordenador: todas as abas de catequista + aba da paróquia
const CATECHIST_COORD_TABS = [
  { path: "/", icon: Home, label: "Início" },
  { path: "/chamada", icon: ClipboardCheck, label: "Chamada" },
  { path: "/missas", icon: Church, label: "Missas" },
  { path: "/alunos", icon: Users, label: "Catequizandos" },
  { path: "/calendario", icon: CalendarDays, label: "Calendário" },
  { path: "/coordenador", icon: Building2, label: "Paróquia" },
  { path: "/relatorios", icon: BarChart3, label: "Relatórios" },
];

const ADMIN_TABS = [
  { path: "/", icon: Home, label: "Início" },
  { path: "/chamada", icon: ClipboardCheck, label: "Chamada" },
  { path: "/alunos", icon: Users, label: "Catequizandos" },
  { path: "/calendario", icon: CalendarDays, label: "Calendário" },
  { path: "/relatorios", icon: BarChart3, label: "Relatórios" },
  { path: "/admin", icon: ShieldCheck, label: "Admin" },
];

const COORDINATOR_TABS = [
  { path: "/", icon: Home, label: "Início" },
  { path: "/coordenador", icon: Building2, label: "Paróquia" },
  { path: "/calendario", icon: CalendarDays, label: "Calendário" },
  { path: "/relatorios", icon: BarChart3, label: "Relatórios" },
];

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin, isCoordinator, isCatequista } = useAuth();

  let tabs;
  if (isAdmin) {
    tabs = ADMIN_TABS;
  } else if (isCatequista && isCoordinator) {
    tabs = CATECHIST_COORD_TABS;
  } else if (isCoordinator) {
    tabs = COORDINATOR_TABS;
  } else {
    tabs = CATECHIST_TABS;
  }

  // Escalonamento dinâmico: quanto mais abas, menor o ícone e o texto
  const tabCount = tabs.length;
  const iconSize =
    tabCount >= 7
      ? "h-4 w-4"
      : tabCount >= 6
      ? "h-5 w-5"
      : "h-6 w-6";
  const labelSize =
    tabCount >= 7
      ? "text-[9px] leading-tight"
      : tabCount >= 6
      ? "text-[10px] leading-tight"
      : "text-xs";
  const buttonPadding =
    tabCount >= 7
      ? "py-2 px-0.5"
      : tabCount >= 6
      ? "py-2 px-1"
      : "py-3 px-1";

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card safe-bottom">
      <div
        className="mx-auto grid w-full items-center"
        style={{ gridTemplateColumns: `repeat(${tabCount}, minmax(0, 1fr))` }}
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
                "flex flex-col items-center gap-0.5 transition-colors min-w-0",
                buttonPadding,
                labelSize,
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
                  iconSize,
                  "shrink-0",
                  active && isAdminTab && "text-warning",
                  active && isCoordTab && "text-secondary-foreground",
                  active && !isAdminTab && !isCoordTab && "text-primary"
                )}
              />
              <span className="w-full truncate text-center">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
