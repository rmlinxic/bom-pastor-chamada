import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export default function ProtectedRoute({
  children,
  access = "authenticated",
}: {
  children: React.ReactNode;
  access?: "authenticated" | "admin" | "coordinator";
}) {
  const { isAuthenticated, isAdmin, isCoordinator, isLoading } = useAuth();
  if (isLoading) return <p className="p-8 text-center" role="status">Verificando acesso...</p>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (access === "admin" && !isAdmin) return <Navigate to="/" replace />;
  if (access === "coordinator" && !isAdmin && !isCoordinator) return <Navigate to="/" replace />;
  return <>{children}</>;
}
