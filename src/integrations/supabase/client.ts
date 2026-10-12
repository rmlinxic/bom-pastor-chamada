import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { authCallbackFragment } from "@/lib/auth-callback";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const callbackFragment = authCallbackFragment(window.location.hash);
export const isAuthCallback = callbackFragment !== null;
if (callbackFragment !== null && callbackFragment !== window.location.hash) {
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${callbackFragment}`);
}

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: sessionStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
