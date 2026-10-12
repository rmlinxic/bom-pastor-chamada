import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { createHmac } from 'node:crypto';
const source = await readFile(new URL('../_shared/staff-login-policy.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const policy = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const { LOGIN_ERROR, parseLoginInput, verifyLegacyPassword, syntheticStaffEmail, gatewayClientIp } = policy;
const passwordSource = await readFile(new URL('../_shared/staff-password.ts', import.meta.url), 'utf8');
const passwordCode = ts.transpileModule(passwordSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { authPassword } = await import(`data:text/javascript;base64,${Buffer.from(passwordCode).toString('base64')}`);
const edgeSource = await readFile(new URL('index.ts', import.meta.url), 'utf8');
const edgeCode = ts.transpileModule(edgeSource.replace(/^import .*;\n/gm, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const id = '11111111-1111-1111-1111-111111111111';
const staff = { id, username: 'maria', active: true, password_hash: '0'.repeat(64), auth_user_id: 'auth-id', email: 'not-trusted@example.com' };
const session = { access_token: 'access', refresh_token: 'refresh', expires_at: 1900000000, token_type: 'bearer', user: { id: 'auth-id', role: 'admin' } };
function request(body = { username: 'maria', password: 'secret' }, headers = {}) {
  return new Request('https://function.example.com', { method: 'POST', headers: { Origin: 'https://example.com', 'x-forwarded-for': '203.0.113.10, 10.0.0.1', ...headers }, body: JSON.stringify(body) });
}
function database(results, operations) {
  return (table) => {
    operations.push(['from', table]);
    const result = results.shift();
    assert.ok(result, 'unexpected query');
    const query = {
      select: (value) => { operations.push(['select', value]); return query; },
      eq: (...args) => { operations.push(['eq', ...args]); return query; },
      is: (...args) => { operations.push(['is', ...args]); return query; },
      limit: () => query,
      update: (value) => { operations.push(['update', value]); return query; },
      maybeSingle: async () => result,
      then: (resolve) => Promise.resolve(result).then(resolve),
    };
    return query;
  };
}
function setup({ results = [{ data: staff, error: null }, { data: { id }, error: null }], allowed = true, authUser, createUser, listUsers, envOverrides = {} } = {}) {
  const operations = [];
  let run;
  const admin = {
    rpc: async (...args) => { operations.push(['rpc', ...args]); return { data: allowed, error: null }; },
    from: database(results, operations),
    auth: { admin: {
      getUserById: async (value) => { operations.push(['getUserById', value]); return { data: { user: authUser ?? { id: 'auth-id', email: 'stored-auth@example.com' } }, error: null }; },
      createUser: async (value) => { operations.push(['createUser', value]); return createUser?.(value) ?? { data: { user: { id: 'auth-id', email: syntheticStaffEmail(id), app_metadata: { staff_profile_id: id, staff_login_migrated: true, password_scheme: 'staff_hmac_v1' } } }, error: null }; },
      listUsers: async (value) => { operations.push(['listUsers', value]); return listUsers?.(value) ?? { data: { users: [] }, error: null }; },
    } },
  };
  const auth = { auth: { signInWithPassword: async (value) => { operations.push(['signIn', value]); return { data: { user: session.user, session }, error: null }; } } };
  const createClient = (_url, key) => { operations.push(['client', key]); return key === 'anon' ? auth : admin; };
  const env = { APP_URL: 'https://example.com/app/', SUPABASE_URL: 'https://db.example.com', APP_PUBLISHABLE_KEY: 'anon', APP_SERVICE_KEY: 'rotated-service', APP_PASSWORD_PEPPER: 'test-only-server-secret', ...envOverrides };
  const Deno = { env: { get: (key) => env[key] }, serve: (handler) => { run = handler; } };
  new Function('createClient', 'authPassword', 'LOGIN_ERROR', 'gatewayClientIp', 'parseLoginInput', 'syntheticStaffEmail', 'verifyLegacyPassword', 'Deno', edgeCode)(createClient, authPassword, LOGIN_ERROR, gatewayClientIp, parseLoginInput, syntheticStaffEmail, verifyLegacyPassword, Deno);
  return { run, operations };
}
async function legacyHash(password) {
  const value = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('bom_pastor_catequese' + password));
  return Buffer.from(value).toString('hex');
}

test('normalizes usernames, ignores forged roles and preserves nonempty passwords', () => {
  assert.deepEqual(parseLoginInput({ username: ' MARIA ', password: 'a', role: 'admin', email: 'attacker@example.com' }), { username: 'maria', password: 'a' });
  assert.equal(parseLoginInput({ username: 'maria', password: '' }), null);
  assert.equal(parseLoginInput({ username: 'maria.name', password: 'secret' }), null);
  assert.equal(gatewayClientIp(new Headers({ 'x-forwarded-for': '203.0.113.10, 10.0.0.1' })), '203.0.113.10');
});
test('legacy comparison is server-only and rejects wrong or malformed hashes', async () => {
  const hash = await legacyHash('secret');
  assert.equal(await verifyLegacyPassword('secret', hash), true);
  assert.equal(await verifyLegacyPassword('wrong', hash), false);
  assert.equal(await verifyLegacyPassword('secret', 'invalid'), false);
});
test('linked login uses server Auth email and exposes only session fields', async () => {
  const { run, operations } = setup();
  const result = await run(request({ username: 'maria', password: 'secret', email: 'attacker@example.com', role: 'admin' }));
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { access_token: 'access', refresh_token: 'refresh', expires_at: 1900000000, token_type: 'bearer' });
  assert.deepEqual(operations[0], ['client', 'rotated-service']);
  assert.equal(operations[1][0], 'rpc');
  assert.deepEqual(operations[1].slice(1), ['consume_staff_login_attempt', { p_username: 'maria', p_client_ip: '203.0.113.10' }]);
  assert.ok(operations.some(([name, input]) => name === 'signIn' && input.email === 'stored-auth@example.com'));
  assert.ok(operations.some((value) => value[0] === 'eq' && value[1] === 'active' && value[2] === true));
  assert.ok(operations.filter(([name]) => name === 'from').every(([, table]) => table === 'catequistas'));
});
test('rate limit denial happens before credential or profile lookup', async () => {
  const { run, operations } = setup({ allowed: false });
  const result = await run(request());
  assert.equal(result.status, 401);
  assert.deepEqual(await result.json(), { error: LOGIN_ERROR });
  assert.ok(!operations.some(([name]) => name === 'from' || name === 'signIn'));
});
test('inactive accounts and invalid legacy passwords never provision identities', async () => {
  for (const profile of [{ ...staff, active: false }, { ...staff, auth_user_id: null }]) {
    const { run, operations } = setup({ results: [{ data: profile, error: null }] });
    const result = await run(request());
    assert.equal(result.status, 401);
    assert.ok(!operations.some(([name]) => name === 'createUser' || name === 'signIn'));
  }
});
test('migrates an active legacy password to confirmed synthetic Auth without sending email', async () => {
  const profile = { ...staff, auth_user_id: null, password_hash: await legacyHash('a') };
  const { run, operations } = setup({ results: [{ data: profile, error: null }, { data: [], error: null }, { data: null, error: null }, { data: { id }, error: null }] });
  const result = await run(request({ username: 'maria', password: 'a' }));
  assert.equal(result.status, 200);
  const provision = operations.find(([name]) => name === 'createUser')[1];
  assert.equal(provision.email, syntheticStaffEmail(id));
  assert.equal(provision.email_confirm, true);
  assert.equal(provision.password, await authPassword(id, 'a', 'test-only-server-secret'));
  assert.notEqual(provision.password, 'a');
  assert.deepEqual(provision.app_metadata, { staff_profile_id: id, staff_login_migrated: true, password_scheme: 'staff_hmac_v1' });
  const update = operations.find(([name]) => name === 'update')[1];
  assert.equal(update.auth_user_id, 'auth-id');
  assert.match(update.password_hash, /^[a-f0-9]{64}$/);
  assert.notEqual(update.password_hash, profile.password_hash);
});
test('refuses adopting an unrelated Auth identity after deterministic email conflict', async () => {
  const profile = { ...staff, auth_user_id: null, password_hash: await legacyHash('secret') };
  const { run, operations } = setup({
    results: [{ data: profile, error: null }],
    createUser: () => ({ data: { user: null }, error: { message: 'exists' } }),
    listUsers: () => ({ data: { users: [{ id: 'unrelated', email: syntheticStaffEmail(id), app_metadata: {} }] }, error: null }),
  });
  const result = await run(request());
  assert.equal(result.status, 401);
  assert.ok(!operations.some(([name]) => name === 'update' || name === 'signIn'));
});
test('rejects wrong origins and oversized bodies without privileged calls', async () => {
  const { run, operations } = setup();
  assert.equal((await run(request({}, { Origin: 'https://evil.example.com' }))).status, 401);
  assert.equal((await run(request({ username: 'maria', password: 'x'.repeat(17000) }))).status, 401);
  assert.equal(operations.length, 0);
  assert.ok(!edgeSource.includes('console.log') && !edgeSource.includes('console.error'));
});
test('retries a concurrent migration only for its server-marked identity and exact profile binding', async () => {
  const profile = { ...staff, auth_user_id: null, password_hash: await legacyHash('secret') };
  const { run, operations } = setup({
    results: [{ data: profile, error: null }, { data: [{ id }], error: null }, { data: null, error: null }, { data: { id }, error: null }],
    createUser: () => ({ data: { user: null }, error: { message: 'exists' } }),
    listUsers: () => ({ data: { users: [{ id: 'auth-id', email: syntheticStaffEmail(id), app_metadata: { staff_profile_id: id, staff_login_migrated: true, password_scheme: 'staff_hmac_v1' } }] }, error: null }),
  });
  const result = await run(request());
  assert.equal(result.status, 200);
  assert.ok(operations.some(([name]) => name === 'signIn'));
  assert.ok(operations.some((value) => value[0] === 'is' && value[1] === 'auth_user_id' && value[2] === null));
});
test('never links an Auth identity already bound to another profile', async () => {
  const profile = { ...staff, auth_user_id: null, password_hash: await legacyHash('secret') };
  const { run, operations } = setup({ results: [{ data: profile, error: null }, { data: [{ id: 'different-staff' }], error: null }] });
  const result = await run(request());
  assert.equal(result.status, 401);
  assert.ok(!operations.some(([name]) => name === 'signIn' || name === 'update'));
});
test('HMAC derivation matches an independent vector and isolates profiles and secrets', async () => {
  const derived = await authPassword(id, 'a', 'pepper');
  assert.equal(derived, createHmac('sha256', 'pepper').update(`bom-pastor-staff-auth:v1:${id}:a`).digest('hex'));
  assert.match(derived, /^[0-9a-f]{64}$/);
  assert.notEqual(derived, await authPassword('22222222-2222-2222-2222-222222222222', 'a', 'pepper'));
  assert.notEqual(derived, await authPassword(id, 'a', 'other-pepper'));
});
test('linked HMAC identities derive short passwords before Auth sign-in without exposing secrets', async () => {
  const { run, operations } = setup({ authUser: { id: 'auth-id', email: syntheticStaffEmail(id), app_metadata: { password_scheme: 'staff_hmac_v1', staff_profile_id: id } } });
  const result = await run(request({ username: 'maria', password: 'a' }));
  assert.equal(result.status, 200);
  const login = operations.find(([name]) => name === 'signIn')[1];
  assert.equal(login.password, await authPassword(id, 'a', 'test-only-server-secret'));
  const response = await result.text();
  assert.ok(!response.includes('test-only-server-secret') && !response.includes(login.password) && !response.includes('staff_profile_id'));
});
test('missing pepper fails closed before privileged operations', async () => {
  const { run, operations } = setup({ envOverrides: { APP_PASSWORD_PEPPER: undefined } });
  const result = await run(request());
  assert.equal(result.status, 503);
  assert.deepEqual(await result.json(), { error: LOGIN_ERROR });
  assert.equal(operations.length, 0);
});
test('IP normalization rejects invalid addresses and forwards a single canonical value', () => {
  assert.equal(gatewayClientIp(new Headers({ 'x-forwarded-for': '999.1.2.3' })), null);
  assert.equal(gatewayClientIp(new Headers({ 'x-forwarded-for': 'not-an-ip' })), null);
  assert.equal(gatewayClientIp(new Headers()), null);
  assert.equal(gatewayClientIp(new Headers({ 'x-forwarded-for': '2001:0db8::1, 10.0.0.1' })), '2001:db8::1');
});
