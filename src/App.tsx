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
  Link,
} from "react-router-dom";
import { LogOut } from "lucide-react";
import { lazy, Suspense } from "react";
import BottomNav from "./components/BottomNav";
import ProtectedRoute from "./components/ProtectedRoute";
import SessionGuard from "./components/SessionGuard";
import { AuthProvider, useAuth } from "./contexts/AuthContext";

const queryClient = new QueryClient();

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Attendance = lazy(() => import("./pages/Attendance"));
const Students = lazy(() => import("./pages/Students"));
const Reports = lazy(() => import("./pages/Reports"));
const Admin = lazy(() => import("./pages/Admin"));
const Justification = lazy(() => import("./pages/Justification"));
const Missas = lazy(() => import("./pages/Missas"));
const Login = lazy(() => import("./pages/Login"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const NotFound = lazy(() => import("./pages/NotFound"));
const CoordinadorView = lazy(() => import("./pages/CoordinadorView"));
const AnoLetivo = lazy(() => import("./pages/AnoLetivo"));
const Calendario = lazy(() => import("./pages/Calendario"));

const PUBLIC_PATHS = ["/justificativa", "/login", "/esqueci-senha", "/redefinir-senha"];

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
          <Link to="/esqueci-senha" className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold">Alterar senha</Link>
        </div>
      )}

      <main className={isPublicPage ? "" : "app-shell"}>
        <Suspense fallback={<p className="p-8 text-center text-muted-foreground" role="status">Carregando página...</p>}>
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
          <Route path="/coordenador" element={<ProtectedRoute access="coordinator"><CoordinadorView /></ProtectedRoute>} />
          <Route path="/ano-letivo" element={<ProtectedRoute access="coordinator"><AnoLetivo /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute access="admin"><Admin /></ProtectedRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
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
