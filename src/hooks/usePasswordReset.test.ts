import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), updateUser: vi.fn(), reset: vi.fn(), rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getUser: mocks.getUser, updateUser: mocks.updateUser, resetPasswordForEmail: mocks.reset }, rpc: mocks.rpc, from: mocks.from } }));
import { requestPasswordReset, confirmPasswordReset } from "./usePasswordReset";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("BASE_URL", "/bom-pastor-chamada/");
  mocks.reset.mockResolvedValue({ error: null });
  mocks.getUser.mockResolvedValue({ data: { user: { id: "verified" } }, error: null });
  mocks.updateUser.mockResolvedValue({ error: null });
});
afterEach(() => vi.unstubAllEnvs());
describe("Supabase email recovery", () => {
  it("sends a normalized email with the deployment BASE_URL reset route", async () => {
    await expect(requestPasswordReset(" MARIA@example.com ")).resolves.toEqual({ error: null });
    expect(mocks.reset).toHaveBeenCalledWith("maria@example.com", { redirectTo: `${window.location.origin}/bom-pastor-chamada/#/redefinir-senha` });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("updates the verified Auth user's password without a legacy database RPC", async () => {
    await expect(confirmPasswordReset("password8")).resolves.toEqual({ error: null });
    expect(mocks.getUser).toHaveBeenCalledTimes(1);
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: "password8" });
    expect(mocks.getUser.mock.invocationCallOrder[0]).toBeLessThan(mocks.updateUser.mock.invocationCallOrder[0]);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("requires a password before any Auth call", async () => {
    expect((await confirmPasswordReset("")).error).toBe("Informe uma senha.");
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it.each(["a", "1234567", "a".repeat(129)])("passes nonempty passwords unchanged to Auth without local length rules", async (password) => {
    await expect(confirmPasswordReset(password)).resolves.toEqual({ error: null });
    expect(mocks.updateUser).toHaveBeenCalledWith({ password });
  });

  it("refuses a password change when the recovery identity cannot be verified", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: "expired" } });
    expect((await confirmPasswordReset("password8")).error).toMatch(/link expirou/);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("returns a safe reset error and the Auth provider’s password validation message", async () => {
    mocks.reset.mockResolvedValue({ error: { message: "raw private detail" } });
    expect((await requestPasswordReset("maria@example.com")).error).not.toContain("raw private detail");
    mocks.updateUser.mockResolvedValue({ error: { message: "Senha recusada pelo provedor." } });
    expect((await confirmPasswordReset("password8")).error).toBe("Senha recusada pelo provedor.");
  });
});
