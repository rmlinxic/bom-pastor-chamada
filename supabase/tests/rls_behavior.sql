-- Isolated/staging PostgreSQL test ONLY, after authenticated_access.sql.
-- Run as the database owner with ON_ERROR_STOP enabled. Every fixture is new,
-- random and rolled back. Existing users/children are never updated/deleted.
-- Assumes Supabase auth.users + anon/authenticated roles, repo public schemas,
-- and no additional required columns/custom triggers missing fixture defaults.
-- This tests DB claims/RLS; live bearer token verification is a separate test.
BEGIN;
CREATE TEMP TABLE rls_fixture_ids (name text PRIMARY KEY, id uuid NOT NULL);
INSERT INTO rls_fixture_ids(name,id) SELECT name, gen_random_uuid() FROM unnest(ARRAY[
  'parish_a','parish_b','teacher_a','teacher_other','teacher_b','coordinator','admin','inactive','unlinked',
  'profile_teacher_a','profile_teacher_other','profile_teacher_b','profile_coordinator','profile_admin','profile_inactive',
  'student_a','student_other','student_b','student_legacy','attendance_a','attendance_b'
]) AS names(name);
GRANT SELECT ON rls_fixture_ids TO anon, authenticated;
DO $$ BEGIN
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO anon, authenticated', (SELECT nspname FROM pg_catalog.pg_namespace WHERE oid=pg_catalog.pg_my_temp_schema()));
END $$;
INSERT INTO public.paroquias(id,nome,ativa)
  SELECT id,'rls_fixture_' || id::text,true FROM rls_fixture_ids WHERE name IN ('parish_a','parish_b');
INSERT INTO auth.users(id,aud,role,email,email_confirmed_at,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  SELECT id,'authenticated','authenticated',id::text || '@rls-test.invalid',now(),'', '{}'::jsonb,'{}'::jsonb,now(),now()
  FROM rls_fixture_ids WHERE name IN ('teacher_a','teacher_other','teacher_b','coordinator','admin','inactive','unlinked');
INSERT INTO public.catequistas(id,name,username,email,password_hash,role,etapa,active,paroquia_id,is_coordenador,auth_user_id)
  SELECT profile.id,'RLS Fixture', 'rls_' || replace(profile.id::text,'-',''), identity.id::text || '@rls-test.invalid',repeat('0',64),
    CASE WHEN identity.name='admin' THEN 'admin' WHEN identity.name='coordinator' THEN 'coordenador' ELSE 'catequista' END,
    CASE WHEN identity.name='teacher_other' THEN 'Segunda Etapa' ELSE 'Primeira Etapa' END,
    identity.name <> 'inactive',
    (SELECT id FROM rls_fixture_ids WHERE name=CASE WHEN identity.name='teacher_b' THEN 'parish_b' ELSE 'parish_a' END),
    identity.name='coordinator', identity.id
  FROM rls_fixture_ids identity JOIN rls_fixture_ids profile ON profile.name='profile_' || identity.name;
INSERT INTO public.students(id,name,class_name,parent_name,phone,active,paroquia_id,catequista_id)
  SELECT id,'RLS Child Fixture',CASE WHEN name='student_other' THEN 'Segunda Etapa' ELSE 'Primeira Etapa' END,
    'RLS Guardian Fixture','11999999999',true,
    (SELECT id FROM rls_fixture_ids WHERE name=CASE WHEN fixture.name='student_b' THEN 'parish_b' ELSE 'parish_a' END),
    CASE WHEN name='student_legacy' THEN NULL ELSE
      (SELECT id FROM rls_fixture_ids WHERE name=CASE WHEN fixture.name='student_b' THEN 'profile_teacher_b' WHEN fixture.name='student_other' THEN 'profile_teacher_other' ELSE 'profile_teacher_a' END) END
  FROM rls_fixture_ids fixture WHERE name IN ('student_a','student_other','student_b','student_legacy');
INSERT INTO public.attendance(id,student_id,date,status)
  SELECT id,(SELECT id FROM rls_fixture_ids WHERE name=CASE WHEN fixture.name='attendance_a' THEN 'student_a' ELSE 'student_b' END),CURRENT_DATE,'presente'
  FROM rls_fixture_ids fixture WHERE name IN ('attendance_a','attendance_b');

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true);
DO $$
BEGIN
  BEGIN
    PERFORM id FROM public.students;
    RAISE EXCEPTION 'Anon unexpectedly read children';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM id FROM public.attendance;
    RAISE EXCEPTION 'Anon unexpectedly read attendance';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM rls_fixture_ids WHERE name='unlinked'),true),
  set_config('request.jwt.claims',(SELECT jsonb_build_object('sub',id::text,'role','authenticated')::text FROM rls_fixture_ids WHERE name='unlinked'),true);
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.students WHERE id IN (SELECT id FROM rls_fixture_ids WHERE name LIKE 'student_%')) THEN RAISE EXCEPTION 'Unlinked identity sees children'; END IF;
  IF public.current_catequista_id() IS NOT NULL THEN RAISE EXCEPTION 'Unlinked identity has a profile'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM rls_fixture_ids WHERE name='inactive'),true),
  set_config('request.jwt.claims',(SELECT jsonb_build_object('sub',id::text,'role','authenticated')::text FROM rls_fixture_ids WHERE name='inactive'),true);
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.students WHERE id IN (SELECT id FROM rls_fixture_ids WHERE name LIKE 'student_%')) THEN RAISE EXCEPTION 'Inactive identity sees children'; END IF;
  IF public.current_catequista_id() IS NOT NULL THEN RAISE EXCEPTION 'Inactive identity has access'; END IF;
END $$;

SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM rls_fixture_ids WHERE name='teacher_a'),true),
  set_config('request.jwt.claims',(SELECT jsonb_build_object('sub',id::text,'role','authenticated')::text FROM rls_fixture_ids WHERE name='teacher_a'),true);
DO $$ DECLARE affected integer;
BEGIN
  IF (SELECT count(*) FROM public.students WHERE id IN (SELECT id FROM rls_fixture_ids WHERE name LIKE 'student_%')) <> 2 THEN RAISE EXCEPTION 'Teacher should see assigned and legacy same-stage students only'; END IF;
  IF (SELECT count(*) FROM public.attendance WHERE id IN (SELECT id FROM rls_fixture_ids WHERE name LIKE 'attendance_%')) <> 1 THEN RAISE EXCEPTION 'Teacher attendance scope wrong'; END IF;
  UPDATE public.students SET parent_name='Fixture Allowed Edit' WHERE id=(SELECT id FROM rls_fixture_ids WHERE name='student_a');
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Teacher own edit denied'; END IF;
  UPDATE public.students SET parent_name='Fixture Forbidden Edit' WHERE id=(SELECT id FROM rls_fixture_ids WHERE name='student_other');
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Teacher edited another teacher child'; END IF;
  BEGIN
    UPDATE public.students SET paroquia_id=(SELECT id FROM rls_fixture_ids WHERE name='parish_b') WHERE id=(SELECT id FROM rls_fixture_ids WHERE name='student_a');
    RAISE EXCEPTION 'Teacher moved own child outside parish';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.students SET catequista_id=(SELECT id FROM rls_fixture_ids WHERE name='profile_teacher_other') WHERE id=(SELECT id FROM rls_fixture_ids WHERE name='student_a');
    RAISE EXCEPTION 'Teacher transferred ownership';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.attendance SET student_id=(SELECT id FROM rls_fixture_ids WHERE name='student_b') WHERE id=(SELECT id FROM rls_fixture_ids WHERE name='attendance_a');
    RAISE EXCEPTION 'Teacher transferred attendance to foreign child';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM password_hash FROM public.catequistas;
    RAISE EXCEPTION 'Teacher read hashes';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.catequistas SET role='admin' WHERE id=(SELECT id FROM rls_fixture_ids WHERE name='profile_teacher_a');
    RAISE EXCEPTION 'Teacher escalated own role';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE public.catequistas SET etapa='Crisma' WHERE id=(SELECT id FROM rls_fixture_ids WHERE name='profile_teacher_a');
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Teacher changed own stage directly'; END IF;
END $$;

SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM rls_fixture_ids WHERE name='coordinator'),true),
  set_config('request.jwt.claims',(SELECT jsonb_build_object('sub',id::text,'role','authenticated')::text FROM rls_fixture_ids WHERE name='coordinator'),true);
DO $$ DECLARE affected integer;
BEGIN
  IF (SELECT count(*) FROM public.students WHERE id IN (SELECT id FROM rls_fixture_ids WHERE name LIKE 'student_%')) <> 3 THEN RAISE EXCEPTION 'Coordinator parish scope wrong'; END IF;
  IF NOT public.can_view_parish((SELECT id FROM rls_fixture_ids WHERE name='parish_a')) OR public.can_view_parish((SELECT id FROM rls_fixture_ids WHERE name='parish_b')) THEN RAISE EXCEPTION 'Coordinator calendar parish scope wrong'; END IF;
  UPDATE public.students SET parent_name='Coordinator Allowed Edit' WHERE id=(SELECT id FROM rls_fixture_ids WHERE name='student_other');
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Coordinator same-parish edit denied'; END IF;
  UPDATE public.students SET parent_name='Coordinator Forbidden Edit' WHERE id=(SELECT id FROM rls_fixture_ids WHERE name='student_b');
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Coordinator edited another parish child'; END IF;
  UPDATE public.catequistas SET etapa='Segunda Etapa' WHERE id=(SELECT id FROM rls_fixture_ids WHERE name='profile_teacher_a');
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Coordinator stage edit denied'; END IF;
  UPDATE public.catequistas SET etapa='Crisma' WHERE id=(SELECT id FROM rls_fixture_ids WHERE name='profile_teacher_b');
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Coordinator changed foreign stage'; END IF;
  BEGIN
    UPDATE public.catequistas SET is_coordenador=true WHERE id=(SELECT id FROM rls_fixture_ids WHERE name='profile_teacher_a');
    RAISE EXCEPTION 'Coordinator granted privileges directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM rls_fixture_ids WHERE name='admin'),true),
  set_config('request.jwt.claims',(SELECT jsonb_build_object('sub',id::text,'role','authenticated')::text FROM rls_fixture_ids WHERE name='admin'),true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.students WHERE id IN (SELECT id FROM rls_fixture_ids WHERE name LIKE 'student_%')) <> 4 THEN RAISE EXCEPTION 'Admin fixture visibility wrong'; END IF;
  IF NOT public.can_view_parish((SELECT id FROM rls_fixture_ids WHERE name='parish_b')) THEN RAISE EXCEPTION 'Admin calendar scope wrong'; END IF;
  IF public.student_belongs_to_parish((SELECT id FROM rls_fixture_ids WHERE name='student_b'),(SELECT id FROM rls_fixture_ids WHERE name='parish_a')) THEN RAISE EXCEPTION 'Admin helper accepted mixed promotion parish'; END IF;
  IF pg_catalog.to_regclass('public.promocoes_pendentes') IS NOT NULL THEN
    BEGIN
      INSERT INTO public.promocoes_pendentes(student_id,paroquia_id,ano_catequetico) VALUES (
        (SELECT id FROM rls_fixture_ids WHERE name='student_b'),(SELECT id FROM rls_fixture_ids WHERE name='parish_a'),9999);
      RAISE EXCEPTION 'Admin inserted mixed-parish promotion';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END IF;
  BEGIN
    PERFORM password_hash FROM public.catequistas;
    RAISE EXCEPTION 'Browser admin read hashes';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

-- Test only the fixture administrator, without touching existing accounts.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.catequistas WHERE role='admin' AND active=true AND auth_user_id IS NOT NULL)=1 THEN
    BEGIN
      UPDATE public.catequistas SET active=false WHERE id=(SELECT id FROM rls_fixture_ids WHERE name='profile_admin');
      RAISE EXCEPTION 'Last admin was deactivated';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
      UPDATE public.catequistas SET auth_user_id=NULL WHERE id=(SELECT id FROM rls_fixture_ids WHERE name='profile_admin');
      RAISE EXCEPTION 'Last admin was unlinked';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
      UPDATE public.catequistas SET role='catequista' WHERE id=(SELECT id FROM rls_fixture_ids WHERE name='profile_admin');
      RAISE EXCEPTION 'Last admin was demoted';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
      DELETE FROM public.catequistas WHERE id=(SELECT id FROM rls_fixture_ids WHERE name='profile_admin');
      RAISE EXCEPTION 'Last admin was deleted';
    EXCEPTION WHEN check_violation THEN NULL; END;
  ELSE
    RAISE NOTICE 'Last-admin runtime assertion skipped: existing active linked admins must remain untouched. Test race separately with two isolated sessions.';
  END IF;
END $$;
ROLLBACK;
