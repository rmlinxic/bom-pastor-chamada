import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
const projectRef = process.env.SUPABASE_PROJECT_REF;
const email = process.env.ADMIN_EMAIL;
const profileId = process.env.ADMIN_PROFILE_ID;
if (!projectRef || !email || !profileId) throw new Error('Defina SUPABASE_PROJECT_REF, ADMIN_EMAIL e ADMIN_PROFILE_ID.');
const keys = JSON.parse(execFileSync('supabase', ['projects', 'api-keys', '--project-ref', projectRef, '--output', 'json'], { encoding: 'utf8' }));
const key = keys.find((entry) => entry.name === 'service_role')?.api_key;
if (!key) throw new Error('Credencial de servidor indisponível.');
const client = createClient(`https://${projectRef}.supabase.co`, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: profile, error: profileError } = await client.from('catequistas').select('id,role,active,auth_user_id').eq('id', profileId).single();
if (profileError || profile?.role !== 'admin' || !profile.active) throw new Error('Administrador existente inválido.');
if (profile.auth_user_id) { console.log('Administrador já vinculado; nenhum convite enviado.'); process.exit(0); }
const { data, error } = await client.auth.admin.inviteUserByEmail(email, { redirectTo: 'https://rmlinxic.github.io/bom-pastor-chamada/#/redefinir-senha' });
if (error || !data.user) throw new Error(error?.message ?? 'Convite não enviado.');
const { error: linkError } = await client.from('catequistas').update({ email: email.toLowerCase(), auth_user_id: data.user.id, password_hash: crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '') }).eq('id', profileId).is('auth_user_id', null);
if (linkError) throw new Error('Convite enviado, mas a vinculação requer revisão administrativa.');
console.log('Convite do administrador enviado e perfil vinculado.');
