import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { supabase, isAuthCallback } from "./integrations/supabase/client";

async function start() {
  if (isAuthCallback) {
    // Auth must consume the token fragment before HashRouter uses the fragment.
    await supabase.auth.getSession();
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#/redefinir-senha`);
  }
  createRoot(document.getElementById("root")!).render(<App />);
}
void start();
