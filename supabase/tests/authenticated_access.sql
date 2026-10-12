-- Run against an isolated database AFTER authenticated_access.sql is applied,
-- with a privileged test role. Assertions read metadata only; never seed or
-- modify production children. Fixtures exercising real JWTs and RLS CRUD must
-- additionally be run against staging before deployment.
BEGIN;
DO $$
DECLARE t text; f text; helper record;
BEGIN
  FOREACH t IN ARRAY ARRAY['students','attendance','mass_attendance','pending_justifications','documentos_catequizando','activity_log','anos_catequeticos','promocoes_pendentes','password_reset_tokens','public_justification_attempts','rejected_public_justifications'] LOOP
    IF pg_catalog.to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    IF NOT (SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = pg_catalog.to_regclass('public.' || t)) THEN
      RAISE EXCEPTION 'RLS missing: %', t;
    END IF;
    IF pg_catalog.has_table_privilege('anon', 'public.' || t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') THEN
      RAISE EXCEPTION 'Anonymous table grant: %', t;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.column_privileges WHERE table_schema = 'public' AND table_name = t AND grantee IN ('anon','PUBLIC')) THEN
      RAISE EXCEPTION 'Anonymous column grant: %', t;
    END IF;
    IF pg_catalog.has_table_privilege('authenticated', 'public.' || t, 'TRUNCATE') THEN
      RAISE EXCEPTION 'Authenticated TRUNCATE: %', t;
    END IF;
  END LOOP;
  IF pg_catalog.has_column_privilege('authenticated','public.catequistas','password_hash','SELECT') THEN RAISE EXCEPTION 'Legacy hash readable'; END IF;
  IF pg_catalog.has_column_privilege('authenticated','public.catequistas','role','UPDATE') OR
     pg_catalog.has_column_privilege('authenticated','public.catequistas','auth_user_id','UPDATE') OR
     pg_catalog.has_column_privilege('authenticated','public.catequistas','paroquia_id','UPDATE') THEN RAISE EXCEPTION 'Identity escalation column writable'; END IF;
  IF NOT pg_catalog.has_column_privilege('authenticated','public.catequistas','etapa','UPDATE') THEN RAISE EXCEPTION 'Coordinator stage grant missing'; END IF;
  IF pg_catalog.has_table_privilege('authenticated','public.catequistas','INSERT,DELETE,TRUNCATE') THEN RAISE EXCEPTION 'Browser provisioning grant'; END IF;
  IF pg_catalog.has_table_privilege('authenticated','public.activity_log','UPDATE,DELETE,TRUNCATE') THEN RAISE EXCEPTION 'Audit modification grant'; END IF;
  FOREACH f IN ARRAY ARRAY['public.reset_password_by_email(text,text)','public.log_login_attempt(text,boolean,text)','public.cleanup_expired_tokens()','public.submit_public_justification(text,text,date,text,uuid)'] LOOP
    IF pg_catalog.to_regprocedure(f) IS NOT NULL AND
      (pg_catalog.has_function_privilege('anon', f, 'EXECUTE') OR pg_catalog.has_function_privilege('authenticated', f, 'EXECUTE')) THEN
      RAISE EXCEPTION 'Unsafe legacy RPC callable: %', f;
    END IF;
  END LOOP;
  FOR helper IN SELECT p.proname, p.proconfig FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY(ARRAY['current_catequista_id','is_admin','is_coordinator','can_manage_parish','can_view_parish','student_belongs_to_parish','guard_last_linked_admin','can_access_student_values','can_access_student','can_read_catequista','submit_public_justification','public_justification_classes','public_justification_students','submit_selected_public_justification','reject_public_justification','apply_pending_justifications_for_attendance','save_catechesis_attendance']) LOOP
    IF (helper.proconfig @> ARRAY['search_path=""']::text[]) IS NOT TRUE THEN RAISE EXCEPTION 'Unpinned search_path: %', helper.proname; END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid = 'public.catequistas'::pg_catalog.regclass AND tgname = 'protect_last_linked_admin' AND NOT tgisinternal AND tgenabled = 'O') THEN RAISE EXCEPTION 'Last-admin trigger missing/disabled'; END IF;
  IF NOT pg_catalog.has_function_privilege('anon','public.submit_selected_public_justification(uuid,uuid,text,date,text)','EXECUTE') THEN RAISE EXCEPTION 'Narrow public submission grant missing'; END IF;
  IF pg_catalog.has_function_privilege('anon','public.reject_public_justification(uuid,date)','EXECUTE') OR pg_catalog.has_function_privilege('anon','public.apply_pending_justifications_for_attendance(uuid[],date)','EXECUTE') THEN RAISE EXCEPTION 'Anonymous staff action grant'; END IF;
END $$;
ROLLBACK;
