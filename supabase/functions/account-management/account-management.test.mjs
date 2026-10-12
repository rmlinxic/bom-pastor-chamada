import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

const source = await readFile(new URL('../_shared/account-policy.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const policy = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const { parseAction, authorizeAction, ActionError } = policy;
const passwordSource = await readFile(new URL('../_shared/staff-password.ts', import.meta.url), 'utf8');
const passwordCode = ts.transpileModule(passwordSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { authPassword } = await import(`data:text/javascript;base64,${Buffer.from(passwordCode).toString('base64')}`);
const pepper = 'test-pepper-'.repeat(8);
const parish = '11111111-1111-1111-1111-111111111111';
const otherParish = '22222222-2222-2222-2222-222222222222';
const accountId = '33333333-3333-3333-3333-333333333333';
const coordinator = { id: '44444444-4444-4444-4444-444444444444', role: 'catequista', is_coordenador: true, paroquia_id: parish, active: true, auth_user_id: 'verified-id' };
const target = { id: accountId, role: 'catequista', is_coordenador: false, paroquia_id: parish, active: true, auth_user_id: 'target-auth', email: 'maria@example.com' };
const profile = { action: 'create', name: '  Maria  ', username: 'MARIA', email: 'MARIA@example.com', role: 'catequista', is_coordenador: false, paroquia_id: parish, etapa: 'Primeira Etapa', password: 'chosen-password' };
const denied = (fn) => assert.throws(fn, (error) => error instanceof ActionError && error.status === 403);

test('validates and normalizes finite actions and rejects invalid fields', () => {
  assert.equal(parseAction(profile).username, 'maria');
  assert.equal(parseAction(profile).email, 'maria@example.com');
  assert.equal(parseAction(profile).name, 'Maria');
  assert.equal(parseAction({ ...profile, action: 'update', id: 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA' }).id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  for (const input of [{ ...profile, action: 'run_sql' }, { ...profile, role: 'superadmin' }, { ...profile, email: 'invalid' }, { ...profile, paroquia_id: 'invalid' }, { ...profile, password: 1234 }, { ...profile, username: 'maria.name' }]) assert.throws(() => parseAction(input), ActionError);
});
test('requires a create password and passes nonempty passwords to Auth without custom length restrictions', () => {
  for (const password of ['a', '1234567', 'a'.repeat(129)]) assert.equal(parseAction({ ...profile, password }).password, password);
  for (const password of [undefined, '', null]) assert.throws(() => parseAction({ ...profile, password }), ActionError);
  assert.equal(parseAction({ ...profile, email: null }).email, null);
  assert.equal(parseAction({ ...profile, email: undefined }).email, null);
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
  assert.throws(() => parseAction({ action: 'admin_invite', id: accountId, email: 'user@example.com' }), ActionError);
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
  const Deno = { env: { get: (key) => ({ APP_URL: 'https://example.com/app/', SUPABASE_URL: 'https://db.example.com', SUPABASE_ANON_KEY: 'legacy-anon', SUPABASE_SERVICE_ROLE_KEY: 'legacy-service', APP_PUBLISHABLE_KEY: 'publishable', APP_SERVICE_KEY: 'secret', APP_PASSWORD_PEPPER: pepper, ...env })[key] }, serve: (fn) => { run = fn; } };
  new Function('createClient', 'ActionError', 'authorizeAction', 'parseAction', 'authPassword', 'Deno', edgeCode)(createClient, ActionError, authorizeAction, parseAction, authPassword, Deno);
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
  assert.deepEqual(keys, ['publishable']);
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
  const run = handler((_url, key) => key === 'publishable' ? { auth: { getUser: async () => ({ data: { user: { id: 'verified-id', is_anonymous: false } }, error: null }) } } : client);
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
test('creates a confirmed private identity with a chosen password and no e-mail sends', async () => {
  const captures = [];
  const authCreates = [];
  let sent = false;
  const client = {
    from: databaseQueue([
      { data: { ...coordinator, role: 'admin' }, error: null },
      { data: { id: parish }, error: null },
      { data: [], error: null },
      { data: { id: accountId }, error: null },
    ], captures),
    auth: { admin: {
      createUser: async (input) => { assert.match(input.password, /^[0-9a-f]{64}$/); authCreates.push(input); return { data: { user: { id: 'created-auth' } }, error: null }; },
      inviteUserByEmail: async () => { sent = true; throw new Error('No e-mails allowed'); },
      listUsers: async () => { throw new Error('No account enumeration allowed'); },
    }, resetPasswordForEmail: async () => { sent = true; throw new Error('No e-mails allowed'); } },
  };
  const usedKeys = [];
  const run = handler((_url, key) => { usedKeys.push(key); return key === 'publishable' ? { auth: { getUser: async () => ({ data: { user: { id: 'verified-id' } }, error: null }) } } : client; });
  const result = await run(new Request('https://fn.example.com', { method: 'POST', headers: { Authorization: 'Bearer valid' }, body: JSON.stringify({ ...profile, email: null, password: 'x' }) }));
  assert.equal(result.status, 200);
  assert.deepEqual(usedKeys, ['publishable', 'secret']);
  assert.equal(authCreates.length, 1);
  assert.equal(authCreates[0].email, `staff+${captures[0].id}@bom-pastor.invalid`);
  assert.equal(authCreates[0].password, await authPassword(captures[0].id, 'x', pepper));
  assert.notEqual(authCreates[0].password, profile.password);
  assert.deepEqual(authCreates[0].app_metadata, { staff_profile_id: captures[0].id, password_scheme: 'staff_hmac_v1' });
  assert.equal(authCreates[0].email_confirm, true);
  assert.equal(captures[0].auth_user_id, 'created-auth');
  assert.equal(captures[0].email, null);
  assert.match(captures[0].password_hash, /^[0-9a-f]{64}$/);
  assert.equal(sent, false);
  assert.deepEqual(await result.json(), { id: accountId });
});
test('profile contact updates never change the private Auth email', async () => {
  const captures = [];
  const authUpdates = [];
  const client = {
    from: databaseQueue([
      { data: { ...coordinator, role: 'admin' }, error: null },
      { data: target, error: null }, { data: { id: parish }, error: null },
      { data: null, error: null },
    ], captures),
    auth: { admin: { getUserById: async () => ({ data: { user: { id: 'target-auth', app_metadata: { preserved: 'value' } } }, error: null }), updateUserById: async (...args) => { authUpdates.push(args); return { error: null }; } } },
  };
  const run = handler((_url, key) => key === 'publishable' ? { auth: { getUser: async () => ({ data: { user: { id: 'verified-id' } }, error: null }) } } : client);
  const result = await run(new Request('https://fn.example.com', { method: 'POST', headers: { Authorization: 'Bearer valid' }, body: JSON.stringify({ ...profile, action: 'update', id: accountId, email: 'new-contact@example.com', newPassword: 'new-password' }) }));
  assert.equal(result.status, 200);
  assert.deepEqual(authUpdates, [['target-auth', { password: await authPassword(accountId, 'new-password', pepper), app_metadata: { preserved: 'value', staff_profile_id: accountId, password_scheme: 'staff_hmac_v1' } }]]);
  assert.equal(captures[0].email, 'new-contact@example.com');
});
test('contact-only update does not call any Auth account mutation', async () => {
  const client = {
    from: databaseQueue([
      { data: { ...coordinator, role: 'admin' }, error: null },
      { data: target, error: null }, { data: { id: parish }, error: null }, { data: null, error: null },
    ]),
    auth: { admin: { updateUserById: async () => { throw new Error('Must not mutate Auth for profile metadata'); } } },
  };
  const run = handler((_url, key) => key === 'publishable' ? { auth: { getUser: async () => ({ data: { user: { id: 'verified-id' } }, error: null }) } } : client);
  const result = await run(new Request('https://fn.example.com', { method: 'POST', headers: { Authorization: 'Bearer valid' }, body: JSON.stringify({ ...profile, action: 'update', id: accountId, email: null }) }));
  assert.equal(result.status, 200);
});
test('unauthenticated callers never construct Auth or service clients', async () => {
  const run = handler(() => { throw new Error('Must not create a client'); });
  const result = await run(new Request('https://fn.example.com', { method: 'POST', body: JSON.stringify(profile) }));
  assert.equal(result.status, 401);
});
test('profile insertion failure cleans up only the identity just created', async () => {
  const deleted = [];
  const client = {
    from: databaseQueue([
      { data: { ...coordinator, role: 'admin' }, error: null }, { data: { id: parish }, error: null },
      { data: [], error: null }, { data: null, error: { message: 'constraint' } },
    ]),
    auth: { admin: {
      createUser: async () => ({ data: { user: { id: 'new-orphan' } }, error: null }),
      deleteUser: async (id) => { deleted.push(id); return { error: null }; },
    } },
  };
  const run = handler((_url, key) => key === 'publishable' ? { auth: { getUser: async () => ({ data: { user: { id: 'verified-id' } }, error: null }) } } : client);
  const result = await run(new Request('https://fn.example.com', { method: 'POST', headers: { Authorization: 'Bearer valid' }, body: JSON.stringify({ ...profile, email: null }) }));
  assert.equal(result.status, 500);
  assert.deepEqual(deleted, ['new-orphan']);
});

test('self-password parser discards target IDs/roles and allows active linked callers only', () => {
  const action = parseAction({ action: 'set_password', password: 'x', id: accountId, role: 'admin' });
  assert.deepEqual(action, { action: 'set_password', password: 'x', currentPassword: undefined });
  authorizeAction({ ...coordinator, is_coordenador: false }, action);
  denied(() => authorizeAction({ ...coordinator, active: false }, action));
  denied(() => authorizeAction({ ...coordinator, auth_user_id: null }, action));
  assert.throws(() => parseAction({ action: 'set_password', password: '' }), ActionError);
});
function selfPasswordHandler({ scheme = true, recent = true, proofAccepted = true, inactive = false } = {}) {
  const updates = [];
  const proofs = [];
  const identity = {
    id: 'verified-id', email: `staff+${coordinator.id}@bom-pastor.invalid`,
    app_metadata: { preserved: 'value', ...(scheme ? { staff_profile_id: coordinator.id, password_scheme: 'staff_hmac_v1' } : {}) },
    last_sign_in_at: new Date(Date.now() - (recent ? 60_000 : 660_000)).toISOString(),
  };
  const service = {
    from: databaseQueue([{ data: { ...coordinator, active: !inactive }, error: null }]),
    auth: { admin: { updateUserById: async (...args) => { updates.push(args); return { error: null }; } } },
  };
  const run = handler((_url, key, options) => {
    if (key === 'secret') return service;
    if (options.global?.headers?.Authorization) return { auth: { getUser: async () => ({ data: { user: identity }, error: null }) } };
    return { auth: { signInWithPassword: async (input) => { proofs.push(input); return { data: { user: proofAccepted ? identity : null }, error: proofAccepted ? null : { message: 'bad proof' } }; } } };
  });
  return { run, updates, proofs, identity };
}
const passwordRequest = (body) => new Request('https://fn.example.com', { method: 'POST', headers: { Authorization: 'Bearer valid' }, body: JSON.stringify(body) });
test('self password changes require and verify current password for HMAC accounts', async () => {
  const { run, updates, proofs, identity } = selfPasswordHandler();
  const response = await run(passwordRequest({ action: 'set_password', password: 'x', currentPassword: 'current', id: 'someone-else' }));
  assert.equal(response.status, 200);
  assert.deepEqual(proofs, [{ email: identity.email, password: await authPassword(coordinator.id, 'current', pepper) }]);
  assert.deepEqual(updates, [['verified-id', { password: await authPassword(coordinator.id, 'x', pepper), app_metadata: identity.app_metadata }]]);
});
test('missing or incorrect current-password proof never changes Auth', async () => {
  const missing = selfPasswordHandler();
  assert.equal((await missing.run(passwordRequest({ action: 'set_password', password: 'x' }))).status, 400);
  assert.deepEqual(missing.updates, []);
  const incorrect = selfPasswordHandler({ proofAccepted: false });
  assert.equal((await incorrect.run(passwordRequest({ action: 'set_password', password: 'x', currentPassword: 'wrong' }))).status, 401);
  assert.deepEqual(incorrect.updates, []);
});
test('bootstrap password setup requires a recent verified sign-in', async () => {
  const recent = selfPasswordHandler({ scheme: false });
  assert.equal((await recent.run(passwordRequest({ action: 'set_password', password: 'x' }))).status, 200);
  assert.deepEqual(recent.proofs, []);
  assert.equal(recent.updates[0][1].app_metadata.password_scheme, 'staff_hmac_v1');
  const stale = selfPasswordHandler({ scheme: false, recent: false });
  assert.equal((await stale.run(passwordRequest({ action: 'set_password', password: 'x' }))).status, 403);
  assert.deepEqual(stale.updates, []);
});
test('inactive self-password requests and missing server pepper fail closed', async () => {
  const inactive = selfPasswordHandler({ inactive: true });
  assert.equal((await inactive.run(passwordRequest({ action: 'set_password', password: 'x' }))).status, 403);
  assert.deepEqual(inactive.updates, []);
  const unconfigured = handler(() => { throw new Error('must not construct a client'); }, { APP_PASSWORD_PEPPER: undefined });
  assert.equal((await unconfigured(passwordRequest({ action: 'set_password', password: 'x' }))).status, 503);
});
function legacyResetHandler({ orphan = false, wrongMarker = false, bound = false } = {}) {
  const captures = [], creates = [], updates = [];
  const identity = { id: 'legacy-auth', email: `staff+${accountId}@bom-pastor.invalid`, app_metadata: { preserved: 'value', staff_profile_id: wrongMarker ? parish : accountId, password_scheme: 'staff_hmac_v1' } };
  const service = {
    from: databaseQueue([
      { data: { ...coordinator, role: 'admin' }, error: null },
      { data: { ...target, auth_user_id: null }, error: null }, { data: { id: parish }, error: null },
      ...(!wrongMarker ? [{ data: bound ? [{ id: parish }] : [], error: null }] : []),
      ...(!wrongMarker && !bound ? [{ data: { id: accountId }, error: null }] : []),
    ], captures),
    auth: { admin: {
      createUser: async (input) => { creates.push(input); return { data: { user: orphan ? null : identity }, error: orphan ? { message: 'exists' } : null }; },
      listUsers: async () => ({ data: { users: [identity] }, error: null }),
      updateUserById: async (...args) => { updates.push(args); return { error: null }; },
    } },
  };
  const run = handler((_url, key) => key === 'publishable' ? { auth: { getUser: async () => ({ data: { user: { id: 'verified-id' } }, error: null }) } } : service);
  return { run, creates, updates, captures };
}
test('administrator can reset an unlinked legacy account without sending e-mail', async () => {
  const reset = legacyResetHandler();
  const result = await reset.run(passwordRequest({ ...profile, action: 'update', id: accountId, newPassword: 'x' }));
  assert.equal(result.status, 200);
  assert.equal(reset.creates[0].password, await authPassword(accountId, 'x', pepper));
  assert.equal(reset.creates[0].email_confirm, true);
  assert.equal(reset.captures[0].auth_user_id, 'legacy-auth');
  assert.match(reset.captures[0].password_hash, /^[0-9a-f]{64}$/);
});
test('orphan legacy identity may be resumed only with matching server marker and no binding', async () => {
  const resumed = legacyResetHandler({ orphan: true });
  assert.equal((await resumed.run(passwordRequest({ ...profile, action: 'update', id: accountId, newPassword: 'x' }))).status, 200);
  assert.equal(resumed.updates[0][0], 'legacy-auth');
  for (const options of [{ orphan: true, wrongMarker: true }, { orphan: true, bound: true }]) {
    const denied = legacyResetHandler(options);
    assert.equal((await denied.run(passwordRequest({ ...profile, action: 'update', id: accountId, newPassword: 'x' }))).status, 409);
    assert.deepEqual(denied.updates, []);
    assert.deepEqual(denied.captures, []);
  }
});
