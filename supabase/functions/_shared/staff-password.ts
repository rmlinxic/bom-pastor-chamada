/** Server-only credential derivation; the pepper must never enter client bundles. */
export async function authPassword(profileId: string, rawPassword: string, pepper: string): Promise<string> {
  if (!pepper || !rawPassword) throw new Error("Credencial indisponível.");
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(pepper), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`bom-pastor-staff-auth:v1:${profileId}:${rawPassword}`));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
