import { createClient } from "npm:@supabase/supabase-js@2.112.0";
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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) throw new ActionError(503, "Serviço não configurado.");
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
    const redirectTo = `${appUrl.href.replace(/#.*$/, "")}#/redefinir-senha`;
    if (action.action === "create" || action.action === "admin_invite") {
      if (target?.auth_user_id) throw new ActionError(409, "Este usuário já possui uma conta de acesso. Use a recuperação de senha.");
      let duplicateEmail = admin.from("catequistas").select("id").eq("email", action.email);
      if (action.action === "admin_invite") duplicateEmail = duplicateEmail.neq("id", action.id);
      const { data: duplicateEmails, error: emailLookupError } = await duplicateEmail.limit(1);
      if (emailLookupError) throw new ActionError(500, "Não foi possível verificar o e-mail.");
      if (duplicateEmails?.length) throw new ActionError(409, "Este e-mail já está associado a outro cadastro.");
      if (action.action === "create") {
        const { data: usernames, error: usernameError } = await admin.from("catequistas").select("id").eq("username", action.username).limit(1);
        if (usernameError) throw new ActionError(500, "Não foi possível verificar o nome de usuário.");
        if (usernames?.length) throw new ActionError(409, "Já existe um usuário com esse nome de usuário.");
      }
      const { data: invitation, error: invitationError } = await admin.auth.admin.inviteUserByEmail(action.email, { redirectTo });
      let authUser = invitation.user;
      let sendRecovery = false;
      if (invitationError || !authUser) {
        // Only an administrator may resume an orphan invitation or explicitly
        // link an existing Auth identity. Never infer roles from its metadata.
        if (caller.role !== "admin") throw new ActionError(409, "Não foi possível enviar o convite. Peça ao administrador para revisar a conta.");
        for (let page = 1; ; page += 1) {
          const { data: listed, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
          if (error) throw new ActionError(500, "Não foi possível verificar a conta de acesso.");
          authUser = listed.users.find((user) => user.email?.trim().toLowerCase() === action.email) ?? null;
          if (authUser || listed.users.length < 1000) break;
        }
        if (!authUser) throw new ActionError(409, "Não foi possível enviar o convite. Verifique o e-mail e tente novamente.");
        sendRecovery = true;
      }
      const { data: bound, error: boundError } = await admin.from("catequistas").select("id").eq("auth_user_id", authUser.id).limit(1);
      if (boundError) throw new ActionError(500, "Não foi possível verificar a vinculação da conta.");
      if (bound?.length) throw new ActionError(409, "Esta conta de acesso já está vinculada a outro cadastro.");
      if (action.action === "create" && action.password) {
        const { error } = await admin.auth.admin.updateUserById(authUser.id, { password: action.password });
        if (error) throw new ActionError(500, "Convite enviado, mas a senha não pôde ser definida. Use a recuperação de senha.");
      }
      const linked = { auth_user_id: authUser.id, email: action.email, password_hash: disabledLegacyHash() };
      const result = action.action === "create"
        ? await admin.from("catequistas").insert({ ...linked, name: action.name, username: action.username, role: action.role, etapa: action.etapa, paroquia_id: action.paroquia_id, is_coordenador: action.is_coordenador }).select("id").single()
        : await admin.from("catequistas").update(linked).eq("id", action.id).is("auth_user_id", null).select("id").single();
      if (result.error) throw new ActionError(500, "Convite enviado, mas o cadastro não foi concluído. O administrador deve revisar a vinculação antes de tentar novamente.");
      if (sendRecovery) {
        const { error } = await admin.auth.resetPasswordForEmail(action.email, { redirectTo });
        if (error) throw new ActionError(500, "Conta vinculada, mas não foi possível enviar a recuperação. Use a página de recuperação de senha para tentar novamente.");
      }
      return respond(200, { id: result.data.id });
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
    if (!target!.auth_user_id) throw new ActionError(409, "Envie um convite administrativo para migrar esta conta primeiro.");
    const { error: authError } = await admin.auth.admin.updateUserById(target!.auth_user_id, { email: action.email, ...(action.newPassword ? { password: action.newPassword } : {}) });
    if (authError) throw new ActionError(400, "Não foi possível atualizar a conta de acesso. Verifique o e-mail e a senha.");
    const { error: updateError } = await admin.from("catequistas").update({ name: action.name, username: action.username, email: action.email, role: action.role, etapa: action.etapa, paroquia_id: action.paroquia_id, is_coordenador: action.is_coordenador }).eq("id", action.id);
    if (updateError) throw new ActionError(500, "A conta de acesso foi atualizada, mas o cadastro precisa ser revisado pelo administrador.");
    return respond(200, { id: action.id });
  } catch (error) {
    if (error instanceof ActionError) return respond(error.status, { error: error.message });
    return respond(500, { error: "Não foi possível concluir a operação." });
  }
});
