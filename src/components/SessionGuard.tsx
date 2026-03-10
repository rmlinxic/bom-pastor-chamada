/**
 * SessionGuard — exibe modal quando a sessão expira por inatividade.
 * Deve envolver o conteúdo autenticado no App.tsx.
 */
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { isSessionExpired } from "@/lib/security";
import { Button } from "@/components/ui/button";
import { LogOut, Clock } from "lucide-react";

export default function SessionGuard({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [showExpired, setShowExpired] = useState(false);

  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      if (isSessionExpired()) setShowExpired(true);
    }, 30_000);
    return () => clearInterval(interval);
  }, [user]);

  if (showExpired) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm">
        <div className="mx-4 max-w-sm w-full rounded-2xl border border-border bg-card p-6 shadow-xl text-center">
          <Clock className="h-12 w-12 text-warning mx-auto mb-3" />
          <h2 className="text-lg font-bold mb-1">Sessão expirada</h2>
          <p className="text-sm text-muted-foreground mb-5">
            Você ficou inativo por muito tempo. Por segurança, faça login novamente.
          </p>
          <Button className="w-full" onClick={() => { logout(); setShowExpired(false); }}>
            <LogOut className="h-4 w-4 mr-2" /> Fazer login novamente
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
