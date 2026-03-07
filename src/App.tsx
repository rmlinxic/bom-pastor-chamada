import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// HashRouter é necessário para GitHub Pages (não suporta roteamento do servidor)
import { HashRouter, Routes, Route, useLocation } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Attendance from "./pages/Attendance";
import Students from "./pages/Students";
import Reports from "./pages/Reports";
import Justification from "./pages/Justification";
import NotFound from "./pages/NotFound";
import BottomNav from "./components/BottomNav";

const queryClient = new QueryClient();

function AppLayout() {
  const location = useLocation();
  const showNav = !["/justificativa"].includes(location.pathname);

  return (
    <>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/chamada" element={<Attendance />} />
        <Route path="/alunos" element={<Students />} />
        <Route path="/relatorios" element={<Reports />} />
        <Route path="/justificativa" element={<Justification />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      {showNav && <BottomNav />}
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <HashRouter>
        <AppLayout />
      </HashRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
