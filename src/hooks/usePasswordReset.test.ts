import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), invoke: vi.fn(), reset: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getUser: mocks.getUser, resetPasswordForEmail: mocks.reset }, functions: { invoke: mocks.invoke }, rpc: mocks.rpc } }));
import { requestPasswordReset, confirmPasswordReset } from "./usePasswordReset";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "verified" } }, error: null });
  mocks.invoke.mockResolvedValue({ data: { success: true }, error: null });
});
describe("alteração de senha sem e-mail", () => {
  it("mantém recuperação por e-mail em espera sem enviar mensagens", async () => {
    expect((await requestPasswordReset("maria@example.com")).error).toMatch(/em espera/);
    expect(mocks.reset).not.toHaveBeenCalled();
  });
  it("exige identidade verificada e envia a senha atual apenas ao servidor", async () => {
    await expect(confirmPasswordReset("nova", "atual")).resolves.toEqual({ error: null });
    expect(mocks.invoke).toHaveBeenCalledWith("account-management", { body: { action: "set_password", password: "nova", currentPassword: "atual" } });
    expect(mocks.getUser.mock.invocationCallOrder[0]).toBeLessThan(mocks.invoke.mock.invocationCallOrder[0]);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each(["a", "1234567", "a".repeat(129)])("aceita qualquer senha não vazia sem regras locais", async (password) => {
    await expect(confirmPasswordReset(password)).resolves.toEqual({ error: null });
    expect(mocks.invoke).toHaveBeenCalledWith("account-management", { body: { action: "set_password", password } });
  });
  it("recusa senha vazia antes de acessar Auth", async () => {
    expect((await confirmPasswordReset("")).error).toBe("Informe uma senha.");
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it("recusa identidade não verificada", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: "expired" } });
    expect((await confirmPasswordReset("nova")).error).toMatch(/Entre na sua conta/);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it("informa falha sem declarar a senha alterada", async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: { message: "private internal detail" } });
    expect((await confirmPasswordReset("nova")).error).toMatch(/Não foi possível/);
  });
});
