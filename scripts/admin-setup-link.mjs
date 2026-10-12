// Offline administrator bootstrap: creates a private local link, sends no email.
import { writeFile, chmod } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { projectKeys, projectRef } from './project-security.mjs';

const profileId = process.env.ADMIN_PROFILE_ID;
if (!profileId) throw new Error('Defina ADMIN_PROFILE_ID para o administrador existente.');
const keys = await projectKeys();
const key = keys.find((entry) => entry.type === 'secret')?.api_key;
if (!key) throw new Error('Credencial de servidor indisponível.');
const client = createClient(`https://${projectRef}.supabase.co`, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: profile, error } = await client.from('catequistas').select('active,role,auth_user_id').eq('id', profileId).single();
if (error || !profile?.active || profile.role !== 'admin' || !profile.auth_user_id) throw new Error('Administrador vinculado inválido.');
const { data: { user }, error: identityError } = await client.auth.admin.getUserById(profile.auth_user_id);
if (identityError || !user?.email) throw new Error('Identidade indisponível.');
if (user.app_metadata?.password_scheme === 'staff_hmac_v1') throw new Error('A senha inicial já foi definida. Use o acesso normal.');
const { data, error: linkError } = await client.auth.admin.generateLink({
  type: user.email_confirmed_at ? 'recovery' : 'invite', email: user.email,
  options: { redirectTo: 'https://rmlinxic.github.io/bom-pastor-chamada/' },
});
if (linkError || !data.properties?.action_link) throw new Error('Não foi possível preparar o acesso inicial.');
const link = data.properties.action_link.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const path = '/private/tmp/bom-pastor-definir-senha-admin.webloc';
await writeFile(path, `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict><key>URL</key><string>${link}</string></dict></plist>\n`, { mode: 0o600 });
await chmod(path, 0o600);
console.log(`Acesso inicial preparado em ${path}. Nenhum email enviado.`);
