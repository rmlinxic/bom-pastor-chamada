import { createClient } from '@supabase/supabase-js';
import { projectKeys, projectRef } from './project-security.mjs';
const keys = await projectKeys();
const secret = keys.find(k => k.type === 'secret')?.api_key;
const publicKey = keys.find(k => k.type === 'publishable')?.api_key;
const url = `https://${projectRef}.supabase.co`;
const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const fixture = crypto.randomUUID();
const username = `qa_${fixture.replaceAll('-', '').slice(0, 16)}`;
const password = crypto.randomUUID() + crypto.randomUUID();
const profiles = [];
const authUsers = [];
let parishId;
async function invoke(name, body, token) {
  const response = await fetch(`${url}/functions/v1/${name}`, { method: 'POST', headers: {
    apikey: publicKey, 'Content-Type': 'application/json', Origin: 'https://rmlinxic.github.io',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(`Teste de ${name} recusado: HTTP ${response.status}.`);
  return result;
}
try {
  for (const table of ['students', 'attendance', 'mass_attendance', 'catequistas', 'documentos_catequizando', 'pending_justifications', 'password_reset_tokens', 'activity_log']) {
    const response = await fetch(`${url}/rest/v1/${table}?select=id&limit=0`, { headers: { apikey: publicKey } });
    if (![401, 403].includes(response.status)) throw new Error(`Leitura anônima indevida em ${table}.`);
  }
  console.log('Visitantes não leem dados privados.');
  const { data: parish, error: parishError } = await admin.from('paroquias').insert({ nome: `QA ${fixture}`, ativa: true }).select('id').single();
  if (parishError) throw new Error('Não foi possível criar paróquia fictícia.');
  parishId = parish.id;
  const { data: identity, error: identityError } = await admin.auth.admin.createUser({ email: `${username}@qa.bom-pastor.invalid`, password, email_confirm: true });
  if (identityError) throw new Error('Não foi possível criar identidade fictícia.');
  authUsers.push(identity.user.id);
  const { data: profile, error: profileError } = await admin.from('catequistas').insert({
    name: 'Administrador QA', username, email: null, password_hash: '0'.repeat(64), role: 'admin', etapa: null, active: true,
    paroquia_id: parishId, is_coordenador: false, auth_user_id: identity.user.id,
  }).select('id').single();
  if (profileError) throw new Error('Não foi possível criar perfil fictício.');
  profiles.push(profile.id);
  const session = await invoke('staff-login', { username, password });
  if (!session.access_token || !session.refresh_token) throw new Error('Login não retornou sessão.');
  console.log('Login por usuário validado pelo servidor.');
  const teacherName = `${username}_t`;
  const created = await invoke('account-management', { action: 'create', name: 'Catequista QA', username: teacherName,
    email: null, password: 'a', role: 'catequista', etapa: 'Primeira Etapa', paroquia_id: parishId, is_coordenador: false }, session.access_token);
  profiles.push(created.id);
  const { data: teacher } = await admin.from('catequistas').select('auth_user_id').eq('id', created.id).single();
  if (teacher?.auth_user_id) authUsers.push(teacher.auth_user_id);
  const teacherSession = await invoke('staff-login', { username: teacherName, password: 'a' });
  if (!teacherSession.access_token) throw new Error('Senha livre não gerou sessão.');
  await invoke('account-management', { action: 'set_password', password: 'b', currentPassword: 'a' }, teacherSession.access_token);
  const changedSession = await invoke('staff-login', { username: teacherName, password: 'b' });
  if (!changedSession.access_token) throw new Error('Senha alterada não funciona.');
  console.log('Cadastro e alteração de senha de um caractere funcionam sem envio de e-mail.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Falha no teste integrado.');
  process.exitCode = 1;
} finally {
  for (const id of profiles.reverse()) {
    const { error } = await admin.from('catequistas').delete().eq('id', id);
    if (error) { console.error('Limpeza do perfil fictício requer revisão.'); process.exitCode = 1; }
  }
  for (const id of authUsers) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) { console.error('Limpeza da identidade fictícia requer revisão.'); process.exitCode = 1; }
  }
  if (parishId) {
    const { error } = await admin.from('paroquias').delete().eq('id', parishId);
    if (error) { console.error('Limpeza da paróquia fictícia requer revisão.'); process.exitCode = 1; }
  }
  console.log('Dados fictícios removidos; contas existentes preservadas.');
}
