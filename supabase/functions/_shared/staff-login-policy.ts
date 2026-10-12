export const LOGIN_ERROR = "Usuário ou senha inválidos, ou acesso indisponível.";
export type LoginInput = { username: string; password: string };
export function parseLoginInput(value: unknown): LoginInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (typeof input.username !== "string" || typeof input.password !== "string" || !input.password) return null;
  const username = input.username.trim().toLowerCase();
  if (!/^[a-z0-9_-]{3,64}$/.test(username)) return null;
  // Password restrictions belong to Supabase Auth. The request itself is bounded.
  return { username, password: input.password };
}
export async function verifyLegacyPassword(password: string, storedHash: unknown): Promise<boolean> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("bom_pastor_catequese" + password));
  const expected = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const stored = typeof storedHash === "string" && /^[0-9a-f]{64}$/.test(storedHash) ? storedHash : "0".repeat(64);
  let difference = 0;
  for (let index = 0; index < 64; index++) difference |= expected.charCodeAt(index) ^ stored.charCodeAt(index);
  return difference === 0 && stored === storedHash;
}
export function syntheticStaffEmail(profileId: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(profileId)) throw new Error(LOGIN_ERROR);
  return `staff+${profileId.toLowerCase()}@bom-pastor.invalid`;
}
export function gatewayClientIp(headers: Headers): string | null {
  // Deployment prerequisite: the trusted gateway must overwrite client-supplied
  // x-forwarded-for and place the original client first in the resulting chain.
  // Do not consume any IP from JSON or trust an arbitrary application header.
  const client = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (!client || client.length > 64) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(client)) {
    const bytes = client.split(".").map(Number);
    return bytes.every((byte) => byte <= 255) ? bytes.join(".") : null;
  }
  if (/^[0-9a-f:]+$/i.test(client) && client.includes(":")) {
    try { return new URL(`http://[${client}]/`).hostname.slice(1, -1); }
    catch { return null; }
  }
  return null;
}
