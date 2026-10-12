import { createClient } from "npm:@supabase/supabase-js@2.112.0";
import { authPassword } from "../_shared/staff-password.ts";
import { ActionError, authorizeAction, parseAction, type Account } from "../_shared/account-policy.ts";

const profileColumns = "id,role,paroquia_id,is_coordenador,active,auth_user_id,email";
const disabledLegacyHash = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");

Deno.serve(async (request: Request) => {
  const configuredUrl = Deno.env.get("APP_URL");
  let appUrl: URL;
  try { appUrl = new URL(configuredUrl || "http://localhost:8080/"); }
  catch { return new Response(JSON.stringify({ error: "Serviço não configurado." }), { status: 503, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }); }
  const origin = request.headers.get("Origin");
  const headers = {
    "Access-Control-Allow-Origin": appUrl.origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
  const respond = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers });
  if (origin && origin !== appUrl.origin) return respond(403, { error: "Origem não autorizada." });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return respond(405, { error: "Método não permitido." });
  try {
    if (appUrl.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(appUrl.hostname)) throw new ActionError(503, "Configuração de segurança indisponível.");
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("APP_PUBLISHABLE_KEY");
    const serviceKey = Deno.env.get("APP_SERVICE_KEY");
    const pepper = Deno.env.get("APP_PASSWORD_PEPPER");
    if (!url || !anonKey || !serviceKey || !pepper) throw new ActionError(503, "Serviço não configurado.");
    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) throw new ActionError(401, "Entre na sua conta para continuar.");
    const token = authorization.slice(7);
    const callerClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authorization } } });
    const { data: verified, error: verificationError } = await callerClient.auth.getUser(token);
    if (verificationError || !verified.user || verified.user.is_anonymous) throw new ActionError(401, "Sessão inválida ou expirada.");
    // The service-role client is created only after Supabase verifies the JWT.
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: caller, error: callerError } = await admin.from("catequistas").select(profileColumns).eq("auth_user_id", verified.user.id).maybeSingle();
    if (callerError || !caller) throw new ActionError(403, "Acesso não autorizado.");
    if (Number(request.headers.get("Content-Length") || 0) > 16_384) throw new ActionError(413, "Solicitação muito grande.");
    const raw = await request.text();
    if (raw.length > 16_384) throw new ActionError(413, "Solicitação muito grande.");
    let json: unknown;
    try { json = JSON.parse(raw); } catch { throw new ActionError(400, "Solicitação inválida."); }
    const action = parseAction(json);
    let target: Account | undefined;
    // Verify the caller's role before reading any target account.
    authorizeAction(caller as Account, action);
    if (action.action === "set_password") {
      const identity = verified.user;
      if (identity.app_metadata?.password_scheme === "staff_hmac_v1") {
        if (identity.app_metadata.staff_profile_id !== caller.id) throw new ActionError(403, "A conta precisa de revisão administrativa.");
        if (!action.currentPassword || !identity.email) throw new ActionError(400, "Informe sua senha atual.");
        const passwordClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
        const { data: proof, error: proofError } = await passwordClient.auth.signInWithPassword({
          email: identity.email, password: await authPassword(caller.id, action.currentPassword, pepper),
        });
        if (proofError || proof.user?.id !== identity.id) throw new ActionError(401, "Senha atual inválida.");
      } else {
        const signedInAt = Date.parse(identity.last_sign_in_at ?? "");
        const age = Date.now() - signedInAt;
        if (!Number.isFinite(age) || age < 0 || age > 600_000) throw new ActionError(403, "Entre novamente na sua conta antes de definir a senha.");
      }
      const { error } = await admin.auth.admin.updateUserById(identity.id, {
        password: await authPassword(caller.id, action.password, pepper),
        app_metadata: { ...identity.app_metadata, staff_profile_id: caller.id, password_scheme: "staff_hmac_v1" },
      });
      if (error) throw new ActionError(400, "Não foi possível alterar a senha. Tente novamente.");
      return respond(200, { id: caller.id });
    }
    if (action.action === "set_mass_monitoring") {
      const { error } = await admin.from("catequistas").update({ monitorar_missas: action.enabled }).eq("id", caller.id).eq("auth_user_id", verified.user.id).eq("active", true);
      if (error) throw new ActionError(500, "Não foi possível atualizar o monitoramento de missas.");
      return respond(200, { id: caller.id });
    }
    if (action.action !== "create") {
      const { data, error } = await admin.from("catequistas").select(profileColumns).eq("id", action.id).maybeSingle();
      if (error || !data) throw new ActionError(404, "Usuário não encontrado.");
      target = data as Account;
      authorizeAction(caller as Account, action, target);
    }
    if ((action.action === "create" || action.action === "update") && action.paroquia_id) {
      const { data: parish, error } = await admin.from("paroquias").select("id").eq("id", action.paroquia_id).eq("ativa", true).maybeSingle();
      if (error || !parish) throw new ActionError(400, "Paróquia inválida ou desativada.");
    }
    if (action.action === "create") {
      // Contact e-mail is metadata only. Auth uses a private synthetic identity
      // and never sends invitations, confirmation or recovery messages.
      if (action.email) {
        const { data: duplicateEmails, error } = await admin.from("catequistas").select("id").eq("email", action.email).limit(1);
        if (error) throw new ActionError(500, "Não foi possível verificar o contato de e-mail.");
        if (duplicateEmails?.length) throw new ActionError(409, "Este e-mail já está associado a outro cadastro.");
      }
      const { data: usernames, error: usernameError } = await admin.from("catequistas").select("id").eq("username", action.username).limit(1);
      if (usernameError) throw new ActionError(500, "Não foi possível verificar o nome de usuário.");
      if (usernames?.length) throw new ActionError(409, "Já existe um usuário com esse nome de usuário.");
      const profileId = crypto.randomUUID();
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: `staff+${profileId}@bom-pastor.invalid`, password: await authPassword(profileId, action.password, pepper), email_confirm: true,
        app_metadata: { staff_profile_id: profileId, password_scheme: "staff_hmac_v1" },
      });
      if (createError || !created.user) throw new ActionError(400, "Não foi possível criar a conta de acesso. Confira a senha e tente novamente.");
      const { data: inserted, error: insertError } = await admin.from("catequistas").insert({
        id: profileId, auth_user_id: created.user.id, password_hash: disabledLegacyHash(),
        email: action.email, name: action.name, username: action.username, role: action.role,
        etapa: action.etapa, paroquia_id: action.paroquia_id, is_coordenador: action.is_coordenador,
      }).select("id").single();
      if (insertError) {
        // A failed profile leaves the new identity unauthorized by RLS. Clean up
        // only this newly-created identity, never adopt an existing account.
        const { error: cleanupError } = await admin.auth.admin.deleteUser(created.user.id);
        if (cleanupError) throw new ActionError(500, "Cadastro incompleto. O administrador deve revisar a conta de acesso antes de repetir.");
        throw new ActionError(500, "Não foi possível concluir o cadastro. Tente novamente.");
      }
      return respond(200, { id: inserted.id });
    }
    if (action.action === "deactivate") {
      const { error } = await admin.from("catequistas").update({ active: false }).eq("id", action.id);
      if (error) throw new ActionError(500, "Não foi possível desativar o usuário.");
      if (target!.auth_user_id) {
        const { error: banError } = await admin.auth.admin.updateUserById(target!.auth_user_id, { ban_duration: "876000h" });
        if (banError) throw new ActionError(500, "Cadastro desativado. O administrador deve revisar o bloqueio da conta de acesso.");
      }
      return respond(200, { id: action.id });
    }
    let legacyLink: { auth_user_id: string; password_hash: string } | undefined;
    let createdLegacyIdentity: string | undefined;
    if (action.newPassword) {
      if (!target!.auth_user_id) {
        // Only verified administrators reach a password reset. A deterministic
        // identity lets them reset a forgotten legacy password without e-mail.
        const email = `staff+${action.id}@bom-pastor.invalid`;
        const providerPassword = await authPassword(action.id, action.newPassword, pepper);
        const { data: created, error: creationError } = await admin.auth.admin.createUser({
          email, password: providerPassword, email_confirm: true,
          app_metadata: { staff_profile_id: action.id, password_scheme: "staff_hmac_v1" },
        });
        let identity = created.user;
        if (creationError || !identity) {
          for (let page = 1; ; page++) {
            const { data: listed, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
            if (error) throw new ActionError(500, "Não foi possível verificar a conta de acesso.");
            identity = listed.users.find((user) => user.email?.toLowerCase() === email) ?? null;
            if (identity || listed.users.length < 1000) break;
          }
          if (!identity || identity.app_metadata?.staff_profile_id !== action.id || identity.app_metadata?.password_scheme !== "staff_hmac_v1") {
            throw new ActionError(409, "A conta de acesso precisa de revisão administrativa antes da vinculação.");
          }
        } else {
          createdLegacyIdentity = identity.id;
        }
        const { data: bound, error: boundError } = await admin.from("catequistas").select("id").eq("auth_user_id", identity.id).limit(1);
        if (boundError || bound?.length) throw new ActionError(409, "Esta conta de acesso não está disponível para vinculação. Recarregue e confira o cadastro.");
        if (!createdLegacyIdentity) {
          const { error } = await admin.auth.admin.updateUserById(identity.id, {
            password: providerPassword,
            app_metadata: { ...identity.app_metadata, staff_profile_id: action.id, password_scheme: "staff_hmac_v1" },
          });
          if (error) throw new ActionError(400, "Não foi possível atualizar a senha.");
        }
        legacyLink = { auth_user_id: identity.id, password_hash: disabledLegacyHash() };
      } else {
        const { data: account, error: lookupError } = await admin.auth.admin.getUserById(target!.auth_user_id);
        if (lookupError || !account.user) throw new ActionError(400, "Não foi possível verificar a conta de acesso.");
        const { error: authError } = await admin.auth.admin.updateUserById(target!.auth_user_id, {
          password: await authPassword(action.id, action.newPassword, pepper),
          app_metadata: { ...account.user.app_metadata, staff_profile_id: action.id, password_scheme: "staff_hmac_v1" },
        });
        if (authError) throw new ActionError(400, "Não foi possível atualizar a senha. Tente novamente.");
      }
    }
    const update = admin.from("catequistas").update({
      ...legacyLink, name: action.name, username: action.username, email: action.email,
      role: action.role, etapa: action.etapa, paroquia_id: action.paroquia_id, is_coordenador: action.is_coordenador,
    }).eq("id", action.id);
    const { error: updateError } = legacyLink ? await update.is("auth_user_id", null).select("id").single() : await update;
    if (updateError) {
      if (createdLegacyIdentity) {
        const { error } = await admin.auth.admin.deleteUser(createdLegacyIdentity);
        if (error) throw new ActionError(500, "Conta de acesso criada, mas o cadastro precisa de revisão administrativa antes de repetir.");
      }
      throw new ActionError(500, action.newPassword ? "A alteração de senha não foi concluída no cadastro. Confira a conta antes de repetir." : "Não foi possível atualizar o cadastro.");
    }
    return respond(200, { id: action.id });
  } catch (error) {
    if (error instanceof ActionError) return respond(error.status, { error: error.message });
    return respond(500, { error: "Não foi possível concluir a operação." });
  }
});
