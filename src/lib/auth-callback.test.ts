import { describe, expect, it } from "vitest";
import { authCallbackFragment } from "./auth-callback";

describe("auth callback routing", () => {
  const tokens = "access_token=test&refresh_token=test-refresh&type=recovery";
  it.each(["#", "#/redefinir-senha#", "#/redefinir-senha&", "#/redefinir-senha?"])("normalizes %s before Auth reads tokens", (prefix) => {
    const result = authCallbackFragment(`${prefix}${tokens}`);
    expect(result).toBe(`#${tokens}`);
    expect(new URLSearchParams(result!.slice(1)).get("access_token")).toBe("test");
  });
  it("recognizes expired callbacks", () => {
    expect(authCallbackFragment("#/redefinir-senha#error=access_denied&error_code=otp_expired")).toBe("#error=access_denied&error_code=otp_expired");
  });
  it.each(["", "#/redefinir-senha", "#/chamada", "#/alunos?access_token=test", "#other=access_token=test"])("leaves ordinary routes unchanged: %s", (hash) => {
    expect(authCallbackFragment(hash)).toBeNull();
  });
});
