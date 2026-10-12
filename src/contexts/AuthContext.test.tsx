import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), signIn: vi.fn(), signOut: vi.fn(), from: vi.fn(), clear: vi.fn(),
  listener: null as ((event: string, session: object | null) => unknown) | null,
  unsubscribe: vi.fn(), select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(),
  initSessionMeta: vi.fn(), clearSessionMeta: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ isAuthCallback: false, supabase: {
  from: mocks.from,
  auth: {
    getUser: mocks.getUser, signInWithPassword: mocks.signIn, signOut: mocks.signOut,
    onAuthStateChange: (listener: typeof mocks.listener) => { mocks.listener = listener; return { data: { subscription: { unsubscribe: mocks.unsubscribe } } }; },
  },
} }));
vi.mock("@tanstack/react-query", () => {
  const client = { clear: mocks.clear };
  return { useQueryClient: () => client };
});
vi.mock("@/lib/security", () => ({ initSessionMeta: mocks.initSessionMeta, clearSessionMeta: mocks.clearSessionMeta, touchSession: vi.fn(), isSessionExpired: () => false }));
import { AuthProvider, useAuth } from "./AuthContext";

const profile = { id: "profile-id", name: "Maria", username: "maria", role: "catequista", etapa: "Primeira Etapa", paroquia_id: "parish", is_coordenador: false, monitorar_missas: true, paroquias: { nome: "Paróquia" } };
const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Node's experimental localStorage can shadow jsdom's storage; use a
  // deterministic browser-compatible store for identity tampering assertions.
  const stored = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
    clear: () => stored.clear(),
  });
  mocks.listener = null;
  const query = { select: mocks.select, eq: mocks.eq, maybeSingle: mocks.maybeSingle };
  mocks.from.mockReturnValue(query); mocks.select.mockReturnValue(query); mocks.eq.mockReturnValue(query);
  mocks.maybeSingle.mockResolvedValue({ data: profile, error: null });
  mocks.getUser.mockResolvedValue({ data: { user: { id: "verified-auth-id" } }, error: null });
  mocks.signIn.mockResolvedValue({ data: { user: { id: "verified-auth-id" } }, error: null });
  mocks.signOut.mockResolvedValue({ error: null });
});

afterEach(() => vi.unstubAllGlobals());

describe("verified Auth identity and profile", () => {
  it("ignores and removes localStorage roles while logged out", () => {
    localStorage.setItem("bom_pastor_session_v3", JSON.stringify({ id: "forged", role: "admin" }));
    const { result } = renderHook(useAuth, { wrapper });
    act(() => { mocks.listener!("INITIAL_SESSION", null); });
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.isAdmin).toBe(false);
    expect(localStorage.getItem("bom_pastor_session_v3")).toBeNull();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("loads privileges only from the profile linked to the verified Auth identity", async () => {
    localStorage.setItem("bom_pastor_session_v3", JSON.stringify({ role: "admin" }));
    const { result } = renderHook(useAuth, { wrapper });
    act(() => { mocks.listener!("INITIAL_SESSION", { user: { id: "untrusted-session-id" } }); });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    expect(mocks.getUser).toHaveBeenCalled();
    expect(mocks.eq).toHaveBeenCalledWith("auth_user_id", "verified-auth-id");
    expect(mocks.eq).toHaveBeenCalledWith("active", true);
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.user?.id).toBe("profile-id");
  });

  it("does not run Auth queries synchronously inside the state-change listener", async () => {
    renderHook(useAuth, { wrapper });
    act(() => {
      const returned = mocks.listener!("TOKEN_REFRESHED", { user: { id: "session-id" } });
      expect(returned).toBeUndefined();
      expect(mocks.getUser).not.toHaveBeenCalled();
    });
    await waitFor(() => expect(mocks.getUser).toHaveBeenCalled());
  });

  it("denies an unverifiable identity without querying profiles", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: "expired" } });
    const { result } = renderHook(useAuth, { wrapper });
    act(() => { mocks.listener!("TOKEN_REFRESHED", {}); });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it.each(["inactive", "unlinked"])("denies an %s account missing from the active linked profile query", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(useAuth, { wrapper });
    let response!: { error: string | null };
    await act(async () => { response = await result.current.login(" MARIA@example.com ", "password8"); });
    expect(response.error).toMatch(/não está autorizada/);
    expect(result.current.user).toBeNull();
    expect(mocks.signIn).toHaveBeenCalledWith({ email: "maria@example.com", password: "password8" });
    expect(mocks.eq).toHaveBeenCalledWith("active", true);
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("does not run a queued Auth refresh after logout invalidates it", async () => {
    const { result } = renderHook(useAuth, { wrapper });
    act(() => {
      mocks.listener!("TOKEN_REFRESHED", { user: { id: "old-session" } });
      result.current.logout();
    });
    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 10)); });
    expect(result.current.user).toBeNull();
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("cannot restore a stale successful login after logout", async () => {
    const pending = deferred<{ data: { user: { id: string } }; error: null }>();
    mocks.signIn.mockReturnValue(pending.promise);
    const { result } = renderHook(useAuth, { wrapper });
    let login!: Promise<{ error: string | null }>;
    act(() => { login = result.current.login("maria@example.com", "password8"); });
    act(() => { result.current.logout(); });
    let response!: { error: string | null };
    await act(async () => {
      pending.resolve({ data: { user: { id: "verified-auth-id" } }, error: null });
      response = await login;
    });
    expect(response.error).toMatch(/cancelada/);
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });
});
