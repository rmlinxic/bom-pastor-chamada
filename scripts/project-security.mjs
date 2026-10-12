import { spawnSync } from 'node:child_process';
export const projectRef = 'nzkertmhokxeiedxwtvl';
export function managementToken() {
  const result = spawnSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], { encoding: 'utf8' });
  const token = result.stdout?.trim();
  if (result.status !== 0 || !token?.startsWith('sbp_')) throw new Error('Credencial de gerenciamento indisponível. Conecte o CLI à conta correta.');
  return token;
}
export async function management(path, method = 'GET', body) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/${path}`, {
    method, headers: { Authorization: `Bearer ${managementToken()}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`Gerenciamento Supabase falhou: HTTP ${response.status}.`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
export async function projectKeys() {
  const keys = await management('api-keys?reveal=true');
  if (!Array.isArray(keys)) throw new Error('Resposta de credenciais inválida.');
  return keys;
}
