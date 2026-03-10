import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  HashRouter,
  Routes,
  Route,
  useLocation,
  Navigate,
} from "react-router-dom";
import { LogOut } from "lucide-react";
import Dashboard from "./pages/Dashboard";
import Attendance from "./pages/Attendance";
import Students from "./pages/Students";
import Reports from "./pages/Reports";
import Admin from "./pages/Admin";
import Justification from "./pages/Justification";
import Missas from "./pages/Missas";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import CoordinadorView from "./pages/CoordinadorView";
import BottomNav from "./components/BottomNav";
import ProtectedRoute from "./components/ProtectedRoute";
import { AuthProvider, useAuth } from "./contexts/AuthContext";

const queryClient = new QueryClient();

const PUBLIC_PATHS = ["/justificativa", "/login"];

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isAdmin } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function CoordinatorRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isCoordinator, isAdmin } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!isCoordinator && !isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppLayout() {
  const location = useLocation();
  const { isAuthenticated, user, logout } = useAuth();
  const isPublicPage = PUBLIC_PATHS.includes(location.pathname);

  return (
    <>
      {isAuthenticated && !isPublicPage && (
        <div className="fixed top-3 right-3 z-50 flex items-center gap-2">
          <span className="hidden sm:block text-xs text-muted-foreground bg-muted/90 rounded-full px-2 py-1 border border-border">
            {user?.name}
          </span>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 rounded-full bg-muted/90 backdrop-blur-sm border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-colors shadow-sm"
            title="Sair da conta"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sair
          </button>
        </div>
      )}

      <Routes>
        {/* Página pública dos pais */}
        <Route path="/justificativa" element={<Justification />} />

        {/* Login */}
        <Route
          path="/login"
          element={isAuthenticated ? <Navigate to="/" replace /> : <Login />}
        />

        {/* Páginas protegidas — qualquer usuário autenticado */}
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/chamada" element={<ProtectedRoute><Attendance /></ProtectedRoute>} />
        <Route path="/alunos" element={<ProtectedRoute><Students /></ProtectedRoute>} />
        <Route path="/relatorios" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
        <Route path="/missas" element={<ProtectedRoute><Missas /></ProtectedRoute>} />

        {/* Página do coordenador paroquial */}
        <Route
          path="/coordenador"
          element={
            <CoordinatorRoute>
              <CoordinadorView />
            </CoordinatorRoute>
          }
        />

        {/* Página exclusiva do administrador */}
        <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />

        <Route path="*" element={<NotFound />} />
      </Routes>

      {isAuthenticated && !isPublicPage && <BottomNav />}
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <HashRouter>
        <AuthProvider>
          <AppLayout />
        </AuthProvider>
      </HashRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
