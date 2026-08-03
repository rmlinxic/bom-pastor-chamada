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
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import CoordinadorView from "./pages/CoordinadorView";
import AnoLetivo from "./pages/AnoLetivo";
import Calendario from "./pages/Calendario";
import BottomNav from "./components/BottomNav";
import ProtectedRoute from "./components/ProtectedRoute";
import SessionGuard from "./components/SessionGuard";
import { AuthProvider, useAuth } from "./contexts/AuthContext";

const queryClient = new QueryClient();

const PUBLIC_PATHS = ["/justificativa", "/login", "/esqueci-senha", "/redefinir-senha"];

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
    <SessionGuard>
      {isAuthenticated && !isPublicPage && (
        <div className="fixed right-3 top-3 z-50 flex items-center gap-2 sm:right-5 sm:top-5">
          <span className="hidden rounded-lg border border-border/80 bg-card/90 px-2.5 py-1.5 text-xs font-semibold text-muted-foreground shadow-sm backdrop-blur-sm sm:block">
            {user?.name}
          </span>
          <button
            onClick={logout}
            className="interactive-lift flex items-center gap-1.5 rounded-lg border border-border/80 bg-card/90 px-3 py-1.5 text-xs font-semibold text-muted-foreground shadow-sm backdrop-blur-sm hover:border-destructive/40 hover:text-destructive"
            title="Sair da conta"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sair
          </button>
        </div>
      )}

      <main className={isPublicPage ? "" : "app-shell"}>
        <Routes>
          <Route path="/justificativa" element={<Justification />} />
          <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <Login />} />
          <Route path="/esqueci-senha" element={<ForgotPassword />} />
          <Route path="/redefinir-senha" element={<ResetPassword />} />
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/chamada" element={<ProtectedRoute><Attendance /></ProtectedRoute>} />
          <Route path="/alunos" element={<ProtectedRoute><Students /></ProtectedRoute>} />
          <Route path="/relatorios" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
          <Route path="/missas" element={<ProtectedRoute><Missas /></ProtectedRoute>} />
          <Route path="/calendario" element={<ProtectedRoute><Calendario /></ProtectedRoute>} />
          <Route path="/coordenador" element={<CoordinatorRoute><CoordinadorView /></CoordinatorRoute>} />
          <Route path="/ano-letivo" element={<CoordinatorRoute><AnoLetivo /></CoordinatorRoute>} />
          <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      {isAuthenticated && !isPublicPage && <BottomNav />}
    </SessionGuard>
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
