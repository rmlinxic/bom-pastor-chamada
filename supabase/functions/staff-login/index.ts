import { createClient } from "npm:@supabase/supabase-js@2.112.0";
import { authPassword } from "../_shared/staff-password.ts";
import { LOGIN_ERROR, gatewayClientIp, parseLoginInput, syntheticStaffEmail, verifyLegacyPassword } from "../_shared/staff-login-policy.ts";

type Staff = { id: string; username: string; password_hash: string; active: boolean; auth_user_id: string | null; email: string | null };
const staffColumns = "id,username,password_hash,active,auth_user_id,email";
const disabledHash = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");

Deno.serve(async (request: Request) => {
  let appUrl: URL;
  try { appUrl = new URL(Deno.env.get("APP_URL") || "http://localhost:8080/"); }
  catch { return new Response(JSON.stringify({ error: LOGIN_ERROR }), { status: 503, headers: { "Content-Type": "application/json" } }); }
  const headers = {
    "Access-Control-Allow-Origin": appUrl.origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin",
    "Content-Type": "application/json", "Cache-Control": "no-store",
  };
  const failure = () => new Response(JSON.stringify({ error: LOGIN_ERROR }), { status: 401, headers });
  if (request.headers.get("Origin") && request.headers.get("Origin") !== appUrl.origin) return failure();
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return failure();
  try {
    if (appUrl.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(appUrl.hostname)) return failure();
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("APP_PUBLISHABLE_KEY");
    const pepper = Deno.env.get("APP_PASSWORD_PEPPER");
    if (!pepper) return new Response(JSON.stringify({ error: LOGIN_ERROR }), { status: 503, headers });
    const serviceKey = Deno.env.get("APP_SERVICE_KEY");
    if (!url || !anonKey || !serviceKey || Number(request.headers.get("Content-Length") || 0) > 16_384) return failure();
    // Bound streamed/chunked input too, before JSON parsing or hashing.
    const reader = request.body?.getReader();
    if (!reader) return failure();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16_384) { await reader.cancel(); return failure(); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const input = parseLoginInput(JSON.parse(new TextDecoder().decode(bytes)));
    if (!input) return failure();
    // This endpoint is intentionally public. Privileged operations are limited
    // to rate limiting and staff authentication; no child data is queried.
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const clientIp = gatewayClientIp(request.headers);
    if (!clientIp) return failure();
    const { data: allowed, error: limitError } = await admin.rpc("consume_staff_login_attempt", { p_username: input.username, p_client_ip: clientIp });
    if (limitError || allowed !== true) return failure();
    const { data: profile, error: profileError } = await admin.from("catequistas").select(staffColumns).eq("username", input.username).eq("active", true).maybeSingle();
    if (profileError || !profile || !profile.active) return failure();
    const staff = profile as Staff;
    const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    let authId = staff.auth_user_id;
    let authEmail: string;
    let migrate = false;
    let loginPassword = input.password;
    if (authId) {
      const { data, error } = await admin.auth.admin.getUserById(authId);
      if (error || !data.user?.email || data.user.id !== authId) return failure();
      authEmail = data.user.email;
      const scheme = data.user.app_metadata?.password_scheme;
      if (scheme === "staff_hmac_v1") {
        if (data.user.app_metadata?.staff_profile_id !== staff.id) return failure();
        loginPassword = await authPassword(staff.id, input.password, pepper);
      } else if (scheme != null) return failure();
    } else {
      if (!await verifyLegacyPassword(input.password, staff.password_hash)) return failure();
      authEmail = syntheticStaffEmail(staff.id);
      loginPassword = await authPassword(staff.id, input.password, pepper);
      const { data: created, error: creationError } = await admin.auth.admin.createUser({
        email: authEmail, password: loginPassword, email_confirm: true,
        app_metadata: { staff_profile_id: staff.id, staff_login_migrated: true, password_scheme: "staff_hmac_v1" },
      });
      let identity = created.user;
      if (creationError || !identity) {
        // A retry may encounter an orphan or a concurrent migration. Adopt only
        // a server-marked deterministic identity, never an arbitrary email.
        for (let page = 1; ; page++) {
          const { data: listed, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
          if (error) return failure();
          identity = listed.users.find((user) => user.email?.toLowerCase() === authEmail) ?? null;
          if (identity || listed.users.length < 1000) break;
        }
      }
      if (!identity || identity.email?.toLowerCase() !== authEmail || identity.app_metadata?.staff_profile_id !== staff.id || identity.app_metadata?.staff_login_migrated !== true || identity.app_metadata?.password_scheme !== "staff_hmac_v1") return failure();
      authId = identity.id;
      const { data: bindings, error: bindingError } = await admin.from("catequistas").select("id").eq("auth_user_id", authId).limit(2);
      if (bindingError || bindings?.some((binding) => binding.id !== staff.id)) return failure();
      migrate = true;
    }
    const { data: login, error: loginError } = await authClient.auth.signInWithPassword({ email: authEmail, password: loginPassword });
    const session = login.session;
    if (loginError || !session || login.user?.id !== authId || session.user.id !== authId) return failure();
    if (migrate) {
      const { error } = await admin.from("catequistas").update({ auth_user_id: authId, password_hash: disabledHash() })
        .eq("id", staff.id).eq("active", true).is("auth_user_id", null).eq("password_hash", staff.password_hash);
      if (error) return failure();
    }
    // A concurrent migration must have linked this exact identity; a concurrent
    // deactivation or different link must never receive a session response.
    const { data: linked, error: linkedError } = await admin.from("catequistas").select("id").eq("id", staff.id).eq("auth_user_id", authId).eq("active", true).maybeSingle();
    if (linkedError || !linked || !Number.isFinite(session.expires_at)) return failure();
    return new Response(JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token, expires_at: session.expires_at, token_type: session.token_type }), { status: 200, headers });
  } catch {
    // Never log passwords, hashes, identity existence, or provider internals.
    return failure();
  }
});
