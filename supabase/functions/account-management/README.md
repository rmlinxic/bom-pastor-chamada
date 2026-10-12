# Account management Edge Function

This function verifies the bearer token with Supabase Auth before constructing a service-role client. It obtains privileges from the active linked `catequistas` database row, never from user-supplied roles or JWT user metadata.

Actions accepted by `supabase.functions.invoke('account-management', { body })`:

- `create`: name, username, email, role, etapa, paroquia_id, is_coordenador, optional password. Sends an email invitation and creates a linked profile. Email is required. Optional nonempty passwords are passed to Supabase Auth without additional client-defined length requirements. Coordinator callers may create ordinary catequistas only in their own parish.
- `update`: id plus the profile fields above, optional newPassword. Coordinator callers may update ordinary catequistas only in their own parish; they cannot grant coordination, change parish or another user’s access email, or set passwords. Administrators may update other authorized accounts.
- `deactivate`: id. Marks the profile inactive first and bans its Auth account. Administrators cannot deactivate themselves.
- `admin_invite`: id, email. Administrator-only migration of an existing legacy profile that has no auth_user_id. It never verifies or accepts a legacy password hash. Administrators can resume an exact-email orphan Auth invitation or link an existing unbound Auth identity; identities already linked to another profile are rejected. A recovery email is sent after resumed linking. Coordinator callers cannot resume existing Auth identities.
- `set_mass_monitoring`: enabled boolean. An active authenticated catequista changes only their own monitoring preference. Additional target IDs are ignored.

Success returns `{ id }`; failures return `{ error }` with an HTTP error status. Auth users, tokens, hashes, service credentials and raw database errors never appear in responses.

## Deployment prerequisites

1. Apply the companion Auth/RLS migration first. `catequistas.auth_user_id` must exist and uniquely link to Auth; all sensitive table policies must require an active linked profile. Remove public legacy login/password-reset access. The random 64-character legacy placeholder is never used as an Auth credential.
2. Manually bootstrap an Auth administrator and link its profile offline. Do not expose unauthenticated bootstrap or legacy-hash migration endpoints.
3. Configure `APP_URL` to `https://rmlinxic.github.io/bom-pastor-chamada/` (or the actual canonical app URL). Browser CORS is restricted to its origin. When absent, the function allows only `http://localhost:8080` browser origin. Invitation redirect is `${APP_URL}#/redefinir-senha`. Configure Supabase redirect allowlist and SMTP/email templates accordingly.
4. Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in server secrets. Never put the service-role key into a Vite environment variable, client build, or repository.
5. Deploy this function with authenticated gateway JWT verification enabled; its own `getUser` verification is still mandatory. New Auth signing-key configurations may require platform gateway settings compatible with the project's JWTs. Verify with a real signed-in test user in staging.
6. After staging deployment, verify invitations, recovery emails, password changes, disabled users, ordinary catequista denials, and coordinator cross-parish denials end to end. No deployment or live account operation was performed while implementing this function.

Auth and profile writes span separate services and are not transactional. Explicit partial-failure errors require administrator review, including an invited orphan Auth account if profile insertion fails. Such an account has no active linked profile and must receive no RLS access. Simultaneous changes to administrator roles require a database transaction/locking guard to guarantee a last-administrator invariant under concurrency.

## Local checks

Run `node --test supabase/functions/account-management/account-management.test.mjs` for policy validation and mocked Auth trust-boundary checks. Tests transpile TypeScript using the project's installed compiler; no network or database writes occur. Run `deno check supabase/functions/account-management/index.ts` in a Deno-enabled environment before deploying. SDK imports are pinned to `@supabase/supabase-js@2.112.0`, matching the installed project SDK.

Official API references: [inviteUserByEmail](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail), [updateUserById](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid), [getUser](https://supabase.com/docs/reference/javascript/auth-getuser).

Email recovery/invitation is on standby. Active actions are create, update, deactivate, set_mass_monitoring and set_password. Login uses staff-login; new identities are confirmed private addresses and never send emails. Server secrets APP_SERVICE_KEY, APP_PUBLISHABLE_KEY and durable APP_PASSWORD_PEPPER are required.
