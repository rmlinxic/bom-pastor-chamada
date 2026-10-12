-- Run only on an isolated/staging database, after both access migrations.
-- Privileged test runner required. All fake fixtures and effects are rolled back.
BEGIN;
DO $$
DECLARE f text; t text; fn record;
BEGIN
  FOREACH t IN ARRAY ARRAY['students','attendance','pending_justifications','public_justification_attempts','rejected_public_justifications'] LOOP
    IF pg_catalog.has_table_privilege('anon','public.' || t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') OR
      EXISTS (SELECT 1 FROM information_schema.column_privileges
        WHERE table_schema = 'public' AND table_name = t AND grantee IN ('anon','PUBLIC')) THEN
      RAISE EXCEPTION 'Public table/column privilege: %', t;
    END IF;
  END LOOP;
  FOREACH f IN ARRAY ARRAY['public.public_justification_classes(uuid)',
    'public.public_justification_students(uuid,text)',
    'public.submit_selected_public_justification(uuid,uuid,text,date,text)'] LOOP
    IF NOT pg_catalog.has_function_privilege('anon',f,'EXECUTE') OR
       NOT pg_catalog.has_function_privilege('authenticated',f,'EXECUTE') THEN
      RAISE EXCEPTION 'Missing selection/submission grant: %', f;
    END IF;
  END LOOP;
  IF pg_catalog.has_function_privilege('anon','public.reject_public_justification(uuid,date)','EXECUTE') OR
     NOT pg_catalog.has_function_privilege('authenticated','public.reject_public_justification(uuid,date)','EXECUTE') THEN
    RAISE EXCEPTION 'Wrong refusal grants';
  END IF;
  IF pg_catalog.has_function_privilege('anon','public.apply_pending_justifications_for_attendance(uuid[],date)','EXECUTE') OR
     NOT pg_catalog.has_function_privilege('authenticated','public.apply_pending_justifications_for_attendance(uuid[],date)','EXECUTE') THEN
    RAISE EXCEPTION 'Wrong atomic apply grants';
  END IF;
  IF pg_catalog.has_function_privilege('anon','public.save_catechesis_attendance(jsonb)','EXECUTE') OR
     NOT pg_catalog.has_function_privilege('authenticated','public.save_catechesis_attendance(jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'Wrong attendance save grants';
  END IF;
  IF pg_catalog.has_function_privilege('anon','public.submit_public_justification(text,text,date,text,uuid)','EXECUTE') OR
     pg_catalog.has_function_privilege('authenticated','public.submit_public_justification(text,text,date,text,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Legacy mutation RPC still callable';
  END IF;
  FOR fn IN SELECT p.proname, p.proconfig, p.prosecdef, p.proacl FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY(ARRAY['public_justification_classes',
      'public_justification_students','submit_selected_public_justification','reject_public_justification',
      'apply_pending_justifications_for_attendance','save_catechesis_attendance']) LOOP
    IF NOT fn.prosecdef OR (fn.proconfig @> ARRAY['search_path=""']::text[]) IS NOT TRUE THEN
      RAISE EXCEPTION 'Unsafe function configuration: %', fn.proname;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.aclexplode(fn.proacl) a WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') THEN
      RAISE EXCEPTION 'PUBLIC execution grant: %', fn.proname;
    END IF;
  END LOOP;
  IF pg_catalog.pg_get_function_result('public.public_justification_students(uuid,text)'::pg_catalog.regprocedure)
    <> 'TABLE(id uuid, name text, class_name text)' THEN RAISE EXCEPTION 'Student RPC exposes extra columns'; END IF;
END $$;

DO $$
DECLARE
  parish uuid := pg_catalog.gen_random_uuid();
  foreign_parish uuid := pg_catalog.gen_random_uuid();
  closed_parish uuid := pg_catalog.gen_random_uuid();
  actor uuid := pg_catalog.gen_random_uuid();
  teacher uuid := pg_catalog.gen_random_uuid();
  child uuid := pg_catalog.gen_random_uuid();
  foreign_child uuid := pg_catalog.gen_random_uuid();
  inactive_child uuid := pg_catalog.gen_random_uuid();
  closed_child uuid := pg_catalog.gen_random_uuid();
  result jsonb;
  hits integer;
  i integer;
BEGIN
  INSERT INTO public.paroquias(id,nome,ativa) VALUES
    (parish,'TEST selection ' || parish,true),
    (foreign_parish,'TEST foreign ' || foreign_parish,true),
    (closed_parish,'TEST closed ' || closed_parish,false);
  INSERT INTO auth.users(id,email) VALUES (actor,actor::text || '@example.invalid');
  INSERT INTO public.catequistas(id,auth_user_id,name,username,password_hash,role,active,paroquia_id,etapa)
    VALUES (teacher,actor,'TEST teacher','test_' || teacher,pg_catalog.repeat('0',64),'catequista',true,parish,'Primeira Etapa');
  INSERT INTO public.students(id,name,class_name,parent_name,phone,active,paroquia_id,catequista_id) VALUES
    (child,'TEST child without phone','Primeira Etapa A','TEST guardian','',true,parish,teacher),
    (foreign_child,'TEST foreign child','Primeira Etapa','TEST guardian','',true,foreign_parish,NULL),
    (inactive_child,'TEST inactive child','Primeira Etapa','TEST guardian','',false,parish,teacher),
    (closed_child,'TEST closed parish child','Primeira Etapa','TEST guardian','',true,closed_parish,NULL);
  INSERT INTO public.attendance(student_id,date,status)
    VALUES (child,CURRENT_DATE,'falta_nao_justificada'),(child,CURRENT_DATE - 1,'presente');

  EXECUTE 'SET LOCAL ROLE anon';
  SELECT pg_catalog.count(*) INTO hits FROM public.public_justification_students(parish,'Primeira Etapa');
  IF hits <> 1 THEN RAISE EXCEPTION 'Active child without phone missing or scope leaked'; END IF;
  SELECT pg_catalog.count(*) INTO hits FROM public.public_justification_students(parish,'Segunda Etapa');
  IF hits <> 0 THEN RAISE EXCEPTION 'Stage scope leaked'; END IF;
  SELECT pg_catalog.count(*) INTO hits FROM public.public_justification_students(closed_parish,'Primeira Etapa');
  IF hits <> 0 THEN RAISE EXCEPTION 'Inactive parish leaked'; END IF;
  SELECT pg_catalog.count(*) INTO hits FROM public.public_justification_classes(parish);
  IF hits <> 1 THEN RAISE EXCEPTION 'Wrong public class list'; END IF;
  result := public.submit_selected_public_justification(child,parish,'Primeira Etapa A',CURRENT_DATE,'TEST first reason');
  IF result <> '{"success":true}'::jsonb THEN RAISE EXCEPTION 'Non-neutral response'; END IF;
  PERFORM public.submit_selected_public_justification(child,parish,'Primeira Etapa A',CURRENT_DATE,'TEST overwrite attempt');
  PERFORM public.submit_selected_public_justification(child,parish,'Primeira Etapa A',CURRENT_DATE - 1,'TEST present');
  PERFORM public.submit_selected_public_justification(child,parish,'Primeira Etapa A',CURRENT_DATE + 1,'TEST future first');
  PERFORM public.submit_selected_public_justification(child,parish,'Primeira Etapa A',CURRENT_DATE + 1,'TEST future overwrite');
  PERFORM public.submit_selected_public_justification(foreign_child,parish,'Primeira Etapa',CURRENT_DATE,'TEST invalid parish');
  PERFORM public.submit_selected_public_justification(inactive_child,parish,'Primeira Etapa',CURRENT_DATE,'TEST inactive');
  PERFORM public.submit_selected_public_justification(closed_child,closed_parish,'Primeira Etapa',CURRENT_DATE,'TEST closed');
  PERFORM public.submit_selected_public_justification(child,parish,'Primeira Etapa A',CURRENT_DATE - 367,'TEST old date');
  PERFORM public.submit_selected_public_justification(child,parish,'Primeira Etapa A',CURRENT_DATE + 2,'TEST rate limited');
  BEGIN
    PERFORM public.reject_public_justification(child,CURRENT_DATE);
    RAISE EXCEPTION 'Anonymous refusal unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.apply_pending_justifications_for_attendance(ARRAY[child],CURRENT_DATE);
    RAISE EXCEPTION 'Anonymous autoapply unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.save_catechesis_attendance('[]'::jsonb);
    RAISE EXCEPTION 'Anonymous attendance save unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.attendance SET status = 'falta_justificada' WHERE student_id = child;
    RAISE EXCEPTION 'Anonymous attendance mutation unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  EXECUTE 'SET LOCAL ROLE NONE';

  IF NOT EXISTS (SELECT 1 FROM public.attendance WHERE student_id = child AND date = CURRENT_DATE
    AND status = 'falta_justificada' AND justification_reason = 'TEST first reason') THEN
    RAISE EXCEPTION 'Default acceptance failed or duplicate replaced attendance reason';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.attendance WHERE student_id = child AND date = CURRENT_DATE - 1 AND status = 'presente') THEN
    RAISE EXCEPTION 'Present attendance changed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pending_justifications WHERE student_id = child AND date = CURRENT_DATE + 1
    AND reason = 'TEST future first') THEN RAISE EXCEPTION 'Future queue missing or duplicate replaced reason'; END IF;
  IF (SELECT pg_catalog.count(*) FROM public.pending_justifications WHERE student_id = child) <> 1 THEN
    RAISE EXCEPTION 'Five/hour rate cap failed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pending_justifications WHERE student_id IN (foreign_child,inactive_child,closed_child)) THEN
    RAISE EXCEPTION 'Invalid child queued';
  END IF;
  PERFORM pg_catalog.set_config('request.jwt.claim.sub',actor::text,true);
  PERFORM pg_catalog.set_config('request.jwt.claims',pg_catalog.jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.reject_public_justification(foreign_child,CURRENT_DATE);
    RAISE EXCEPTION 'Foreign parish refusal unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  result := public.reject_public_justification(child,CURRENT_DATE);
  IF result <> '{"success":true}'::jsonb THEN RAISE EXCEPTION 'Refusal failed'; END IF;
  PERFORM public.reject_public_justification(child,CURRENT_DATE + 1);
  PERFORM public.reject_public_justification(child,CURRENT_DATE - 1);
  EXECUTE 'SET LOCAL ROLE NONE';
  IF NOT EXISTS (SELECT 1 FROM public.attendance WHERE student_id = child AND date = CURRENT_DATE
    AND status = 'falta_nao_justificada' AND justification_reason IS NULL) OR
     EXISTS (SELECT 1 FROM public.pending_justifications WHERE student_id = child) THEN
    RAISE EXCEPTION 'Refusal did not clear attendance reason and queue';
  END IF;
  IF (SELECT pg_catalog.count(*) FROM public.rejected_public_justifications WHERE student_id = child) <> 3 THEN
    RAISE EXCEPTION 'Persistent refusal markers missing';
  END IF;
  -- Reset only this fixture counter, so retry exercises the refusal marker.
  DELETE FROM public.public_justification_attempts
    WHERE fingerprint = 'selected:' || pg_catalog.md5(parish::text || ':' || child::text);
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM public.submit_selected_public_justification(child,parish,'Primeira Etapa A',CURRENT_DATE,'TEST retry refused');
  PERFORM public.submit_selected_public_justification(child,parish,'Primeira Etapa A',CURRENT_DATE + 1,'TEST future retry refused');
  EXECUTE 'SET LOCAL ROLE NONE';
  IF NOT EXISTS (SELECT 1 FROM public.attendance WHERE student_id = child AND date = CURRENT_DATE
    AND status = 'falta_nao_justificada' AND justification_reason IS NULL) OR
     EXISTS (SELECT 1 FROM public.pending_justifications WHERE student_id = child) THEN
    RAISE EXCEPTION 'Anonymous retry undid refusal';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.attendance WHERE student_id = child AND date = CURRENT_DATE - 1 AND status = 'presente') THEN
    RAISE EXCEPTION 'Refusal changed present attendance';
  END IF;

  -- Atomic attendance save: fake a stale queue behind a refusal marker, and
  -- verify a separate accepted queue is applied and consumed exactly once.
  INSERT INTO public.pending_justifications(student_id,date,reason,paroquia_id) VALUES
    (child,CURRENT_DATE + 1,'TEST stale refused queue',parish),
    (child,CURRENT_DATE + 3,'TEST accepted queue',parish),
    (child,CURRENT_DATE + 4,'TEST present queue',parish);
  INSERT INTO public.attendance(student_id,date,status) VALUES
    (child,CURRENT_DATE + 1,'falta_nao_justificada'),
    (child,CURRENT_DATE + 3,'falta_nao_justificada'),
    (child,CURRENT_DATE + 4,'presente');
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.apply_pending_justifications_for_attendance(ARRAY[child,foreign_child],CURRENT_DATE + 3);
    RAISE EXCEPTION 'Mixed unauthorized autoapply batch unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  hits := public.apply_pending_justifications_for_attendance(ARRAY[child,child],CURRENT_DATE + 3);
  IF hits <> 1 THEN RAISE EXCEPTION 'Accepted queue not applied exactly once'; END IF;
  hits := public.apply_pending_justifications_for_attendance(ARRAY[child],CURRENT_DATE + 3);
  IF hits <> 0 THEN RAISE EXCEPTION 'Consumed queue reapplied'; END IF;
  hits := public.apply_pending_justifications_for_attendance(ARRAY[child],CURRENT_DATE + 1);
  IF hits <> 0 THEN RAISE EXCEPTION 'Refusal marker bypassed by atomic autoapply'; END IF;
  hits := public.apply_pending_justifications_for_attendance(ARRAY[child],CURRENT_DATE + 4);
  IF hits <> 0 THEN RAISE EXCEPTION 'Present attendance changed by atomic autoapply'; END IF;
  hits := public.apply_pending_justifications_for_attendance(ARRAY[]::uuid[],CURRENT_DATE);
  IF hits <> 0 THEN RAISE EXCEPTION 'Empty autoapply batch not neutral'; END IF;
  BEGIN
    PERFORM public.apply_pending_justifications_for_attendance(pg_catalog.array_fill(child,ARRAY[201]),CURRENT_DATE);
    RAISE EXCEPTION 'Oversized autoapply batch unexpectedly allowed';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  EXECUTE 'SET LOCAL ROLE NONE';
  IF NOT EXISTS (SELECT 1 FROM public.attendance WHERE student_id = child AND date = CURRENT_DATE + 3
      AND status = 'falta_justificada' AND justification_reason = 'TEST accepted queue') OR
     EXISTS (SELECT 1 FROM public.pending_justifications WHERE student_id = child AND date = CURRENT_DATE + 3) THEN
    RAISE EXCEPTION 'Atomic autoapply did not update attendance and delete queue';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.attendance WHERE student_id = child AND date = CURRENT_DATE + 1 AND status = 'falta_nao_justificada') OR
     NOT EXISTS (SELECT 1 FROM public.pending_justifications WHERE student_id = child AND date = CURRENT_DATE + 1) OR
     NOT EXISTS (SELECT 1 FROM public.attendance WHERE student_id = child AND date = CURRENT_DATE + 4 AND status = 'presente') OR
     NOT EXISTS (SELECT 1 FROM public.pending_justifications WHERE student_id = child AND date = CURRENT_DATE + 4) THEN
    RAISE EXCEPTION 'Skipped refused/present queue was changed';
  END IF;

  -- An anonymous retry between the attendance upsert and atomic autoapply must
  -- preserve the first accepted queue reason and consume that queue itself.
  DELETE FROM public.public_justification_attempts
    WHERE fingerprint = 'selected:' || pg_catalog.md5(parish::text || ':' || child::text);
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM public.submit_selected_public_justification(child,parish,'Primeira Etapa A',CURRENT_DATE + 5,'TEST first accepted A');
  EXECUTE 'SET LOCAL ROLE NONE';
  INSERT INTO public.attendance(student_id,date,status) VALUES (child,CURRENT_DATE + 5,'falta_nao_justificada');
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM public.submit_selected_public_justification(child,parish,'Primeira Etapa A',CURRENT_DATE + 5,'TEST retry B');
  EXECUTE 'SET LOCAL ROLE NONE';
  IF NOT EXISTS (SELECT 1 FROM public.attendance WHERE student_id = child AND date = CURRENT_DATE + 5
      AND status = 'falta_justificada' AND justification_reason = 'TEST first accepted A') OR
     EXISTS (SELECT 1 FROM public.pending_justifications WHERE student_id = child AND date = CURRENT_DATE + 5) THEN
    RAISE EXCEPTION 'Retry after attendance upsert replaced first accepted reason or left stale queue';
  END IF;
  EXECUTE 'SET LOCAL ROLE authenticated';
  hits := public.apply_pending_justifications_for_attendance(ARRAY[child],CURRENT_DATE + 5);
  IF hits <> 0 THEN RAISE EXCEPTION 'Consumed retry queue reapplied'; END IF;
  EXECUTE 'SET LOCAL ROLE NONE';

  -- A roster snapshot cached before refusal must not restore its old accepted
  -- status. Likewise a cached absence must preserve a new public reason.
  EXECUTE 'SET LOCAL ROLE authenticated';
  hits := public.save_catechesis_attendance(pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('student_id',child,'date',CURRENT_DATE,'status','falta_justificada','explicit_status',false),
    pg_catalog.jsonb_build_object('student_id',child,'date',CURRENT_DATE + 5,'status','falta_nao_justificada','explicit_status',false)
  ));
  IF hits <> 0 THEN RAISE EXCEPTION 'Stale snapshot unexpectedly applied queue'; END IF;
  BEGIN
    PERFORM public.save_catechesis_attendance(pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('student_id',child,'date',CURRENT_DATE,'status','presente','explicit_status',true),
      pg_catalog.jsonb_build_object('student_id',foreign_child,'date',CURRENT_DATE,'status','presente','explicit_status',true)
    ));
    RAISE EXCEPTION 'Mixed unauthorized save unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.save_catechesis_attendance('[{"student_id":"bad uuid","date":"2026-01-01","status":"presente","explicit_status":true}]'::jsonb);
    RAISE EXCEPTION 'Malformed save unexpectedly allowed';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  EXECUTE 'SET LOCAL ROLE NONE';
  IF NOT EXISTS (SELECT 1 FROM public.attendance WHERE student_id = child AND date = CURRENT_DATE
      AND status = 'falta_nao_justificada' AND justification_reason IS NULL) OR
     NOT EXISTS (SELECT 1 FROM public.attendance WHERE student_id = child AND date = CURRENT_DATE + 5
      AND status = 'falta_justificada' AND justification_reason = 'TEST first accepted A') THEN
    RAISE EXCEPTION 'Stale save overwrote fresh refusal/public justification';
  END IF;
  INSERT INTO public.pending_justifications(student_id,date,reason,paroquia_id)
    VALUES (child,CURRENT_DATE + 6,'TEST save accepted queue',parish);
  EXECUTE 'SET LOCAL ROLE authenticated';
  hits := public.save_catechesis_attendance(pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('student_id',child,'date',CURRENT_DATE + 6,'status','falta_nao_justificada','explicit_status',false)
  ));
  IF hits <> 1 THEN RAISE EXCEPTION 'Attendance save did not atomically apply queue'; END IF;
  -- An explicit teacher choice may intentionally justify after refusal.
  PERFORM public.save_catechesis_attendance(pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('student_id',child,'date',CURRENT_DATE,'status','falta_justificada','explicit_status',true)
  ));
  EXECUTE 'SET LOCAL ROLE NONE';
  IF NOT EXISTS (SELECT 1 FROM public.attendance WHERE student_id = child AND date = CURRENT_DATE + 6
      AND status = 'falta_justificada' AND justification_reason = 'TEST save accepted queue') OR
     EXISTS (SELECT 1 FROM public.pending_justifications WHERE student_id = child AND date = CURRENT_DATE + 6) OR
     NOT EXISTS (SELECT 1 FROM public.attendance WHERE student_id = child AND date = CURRENT_DATE AND status = 'falta_justificada') THEN
    RAISE EXCEPTION 'Atomic save or explicit manual justification failed';
  END IF;
END $$;
ROLLBACK;
