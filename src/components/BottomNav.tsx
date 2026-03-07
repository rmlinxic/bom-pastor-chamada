import { Home, ClipboardCheck, Users, BarChart3 } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

const tabs = [
  { path: "/", icon: Home, label: "Home" },
  { path: "/chamada", icon: ClipboardCheck, label: "Chamada" },
  { path: "/alunos", icon: Users, label: "Alunos" },
  { path: "/relatorios", icon: BarChart3, label: "Relatórios" },
];

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card safe-bottom">
      <div className="mx-auto flex max-w-lg items-center justify-around">
        {tabs.map((tab) => {
          const active = location.pathname === tab.path;
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-3 text-xs transition-colors",
                active
                  ? "text-primary font-semibold"
                  : "text-muted-foreground"
              )}
            >
              <tab.icon className={cn("h-6 w-6", active && "text-primary")} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
