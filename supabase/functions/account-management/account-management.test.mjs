import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

const source = await readFile(new URL('../_shared/account-policy.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const policy = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const { parseAction, authorizeAction, ActionError } = policy;
const parish = '11111111-1111-1111-1111-111111111111';
const otherParish = '22222222-2222-2222-2222-222222222222';
const accountId = '33333333-3333-3333-3333-333333333333';
const coordinator = { id: 'coordinator', role: 'catequista', is_coordenador: true, paroquia_id: parish, active: true, auth_user_id: 'verified-id' };
const target = { id: accountId, role: 'catequista', is_coordenador: false, paroquia_id: parish, active: true, auth_user_id: 'target-auth', email: 'maria@example.com' };
const profile = { action: 'create', name: '  Maria  ', username: 'MARIA', email: 'MARIA@example.com', role: 'catequista', is_coordenador: false, paroquia_id: parish, etapa: 'Primeira Etapa' };
const denied = (fn) => assert.throws(fn, (error) => error instanceof ActionError && error.status === 403);

test('validates and normalizes finite actions and rejects invalid fields', () => {
  assert.equal(parseAction(profile).username, 'maria');
  assert.equal(parseAction(profile).email, 'maria@example.com');
  assert.equal(parseAction(profile).name, 'Maria');
  for (const input of [{ ...profile, action: 'run_sql' }, { ...profile, role: 'superadmin' }, { ...profile, email: null }, { ...profile, paroquia_id: 'invalid' }, { ...profile, password: 1234 }, { ...profile, username: 'maria.name' }]) assert.throws(() => parseAction(input), ActionError);
});
test('passes optional nonempty passwords to Auth without custom length restrictions', () => {
  for (const password of ['a', '1234567', 'a'.repeat(129)]) assert.equal(parseAction({ ...profile, password }).password, password);
});
test('coordinators may create ordinary catequistas only in their own parish', () => {
  authorizeAction(coordinator, parseAction(profile));
  denied(() => authorizeAction(coordinator, parseAction({ ...profile, role: 'admin' })));
  denied(() => authorizeAction(coordinator, parseAction({ ...profile, is_coordenador: true })));
  denied(() => authorizeAction(coordinator, parseAction({ ...profile, paroquia_id: otherParish })));
});
test('coordinators cannot change privileged users, other parishes or passwords', () => {
  const action = parseAction({ ...profile, action: 'update', id: accountId });
  authorizeAction(coordinator, action, target);
  denied(() => authorizeAction(coordinator, action, { ...target, paroquia_id: otherParish }));
  denied(() => authorizeAction(coordinator, action, { ...target, role: 'admin' }));
  denied(() => authorizeAction(coordinator, action, { ...target, is_coordenador: true }));
  denied(() => authorizeAction(coordinator, { ...action, newPassword: 'new-pass' }, target));
  denied(() => authorizeAction(coordinator, { ...action, email: 'attacker@example.com' }, target));
  denied(() => authorizeAction(coordinator, parseAction({ action: 'admin_invite', id: accountId, email: 'user@example.com' }), target));
});
test('inactive and unlinked callers are denied; administrators cannot disable themselves', () => {
  denied(() => authorizeAction({ ...coordinator, active: false }, parseAction(profile)));
  denied(() => authorizeAction({ ...coordinator, auth_user_id: null }, parseAction(profile)));
  denied(() => authorizeAction({ ...coordinator, role: 'catequista', is_coordenador: false }, parseAction(profile)));
  const admin = { ...coordinator, role: 'admin' };
  denied(() => authorizeAction(admin, { action: 'deactivate', id: admin.id }, admin));
});

const edgeSource = await readFile(new URL('index.ts', import.meta.url), 'utf8');
const edgeCode = ts.transpileModule(edgeSource.replace(/^import .*;\n/gm, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
function handler(createClient, env = {}) {
  let run;
  const Deno = { env: { get: (key) => ({ APP_URL: 'https://example.com/app/', SUPABASE_URL: 'https://db.example.com', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', ...env })[key] }, serve: (fn) => { run = fn; } };
  new Function('createClient', 'ActionError', 'authorizeAction', 'parseAction', 'Deno', edgeCode)(createClient, ActionError, authorizeAction, parseAction, Deno);
  return run;
}
test('rejects disallowed browser origins before creating any client', async () => {
  const run = handler(() => { throw new Error('must not create client'); });
  const result = await run(new Request('https://fn.example.com', { method: 'POST', headers: { Origin: 'https://evil.example.com' }, body: '{}' }));
  assert.equal(result.status, 403);
});
test('failed JWT verification never constructs a service-role client', async () => {
  const keys = [];
  const run = handler((_url, key) => { keys.push(key); return { auth: { getUser: async () => ({ data: { user: null }, error: { message: 'invalid' } }) } }; });
  const result = await run(new Request('https://fn.example.com', { method: 'POST', headers: { Authorization: 'Bearer bad' }, body: '{}' }));
  assert.equal(result.status, 401);
  assert.deepEqual(keys, ['anon']);
});
test('mass monitoring is self-only and unavailable to non-catequista roles', () => {
  const action = parseAction({ action: 'set_mass_monitoring', enabled: false, id: 'someone-else' });
  assert.deepEqual(action, { action: 'set_mass_monitoring', enabled: false });
  authorizeAction(coordinator, action);
  denied(() => authorizeAction({ ...coordinator, role: 'admin' }, action));
  denied(() => authorizeAction({ ...coordinator, role: 'coordenador' }, action));
  assert.throws(() => parseAction({ action: 'set_mass_monitoring', enabled: 'false' }), ActionError);
});
test('monitoring handler changes only the verified caller profile', async () => {
  const updates = [];
  const filters = [];
  const client = {
    from: () => {
      const query = {
        select: () => query,
        eq: (...args) => { filters.push(args); return query; },
        update: (value) => { updates.push(value); return query; },
        maybeSingle: async () => ({ data: coordinator, error: null }),
        then: (resolve) => Promise.resolve({ error: null }).then(resolve),
      };
      return query;
    },
  };
  const run = handler((_url, key) => key === 'anon' ? { auth: { getUser: async () => ({ data: { user: { id: 'verified-id', is_anonymous: false } }, error: null }) } } : client);
  const result = await run(new Request('https://fn.example.com', { method: 'POST', headers: { Authorization: 'Bearer valid' }, body: JSON.stringify({ action: 'set_mass_monitoring', enabled: false, id: 'someone-else' }) }));
  assert.equal(result.status, 200);
  assert.deepEqual(updates, [{ monitorar_missas: false }]);
  assert.ok(filters.some(([field, value]) => field === 'id' && value === coordinator.id));
  assert.ok(filters.some(([field, value]) => field === 'auth_user_id' && value === 'verified-id'));
});
function databaseQueue(results, captures = []) {
  return () => {
    const result = results.shift();
    assert.ok(result, 'unexpected database query');
    const query = {
      select: () => query, eq: () => query, neq: () => query, is: () => query, limit: () => query,
      insert: (value) => { captures.push(value); return query; },
      update: (value) => { captures.push(value); return query; },
      maybeSingle: async () => result,
      single: async () => result,
      then: (resolve) => Promise.resolve(result).then(resolve),
    };
    return query;
  };
}
test('administrator can resume an orphan Auth invitation without duplicating its identity', async () => {
  const captures = [];
  let recovery;
  const client = {
    from: databaseQueue([
      { data: { ...coordinator, role: 'admin' }, error: null },
      { data: { id: parish }, error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: { id: accountId }, error: null },
    ], captures),
    auth: {
      admin: {
        inviteUserByEmail: async () => ({ data: { user: null }, error: { message: 'already exists' } }),
        listUsers: async () => ({ data: { users: [{ id: 'orphan-auth', email: 'maria@example.com', email_confirmed_at: '2026-10-12' }] }, error: null }),
      },
      resetPasswordForEmail: async (...args) => { recovery = args; return { error: null }; },
    },
  };
  const run = handler((_url, key) => key === 'anon' ? { auth: { getUser: async () => ({ data: { user: { id: 'verified-id' } }, error: null }) } } : client);
  const result = await run(new Request('https://fn.example.com', { method: 'POST', headers: { Authorization: 'Bearer valid' }, body: JSON.stringify(profile) }));
  assert.equal(result.status, 200);
  assert.equal(captures[0].auth_user_id, 'orphan-auth');
  assert.equal(captures[0].password_hash.length, 64);
  assert.deepEqual(recovery, ['maria@example.com', { redirectTo: 'https://example.com/app/#/redefinir-senha' }]);
  assert.deepEqual(await result.json(), { id: accountId });
});
test('coordinator cannot link an existing Auth account after an invitation conflict', async () => {
  let listed = false;
  const client = {
    from: databaseQueue([
      { data: coordinator, error: null }, { data: { id: parish }, error: null },
      { data: [], error: null }, { data: [], error: null },
    ]),
    auth: { admin: {
      inviteUserByEmail: async () => ({ data: { user: null }, error: { message: 'already exists' } }),
      listUsers: async () => { listed = true; throw new Error('should not enumerate Auth'); },
    } },
  };
  const run = handler((_url, key) => key === 'anon' ? { auth: { getUser: async () => ({ data: { user: { id: 'verified-id' } }, error: null }) } } : client);
  const result = await run(new Request('https://fn.example.com', { method: 'POST', headers: { Authorization: 'Bearer valid' }, body: JSON.stringify(profile) }));
  assert.equal(result.status, 409);
  assert.equal(listed, false);
});
