-- Auth-linked access. Apply with a privileged migration role after reviewing the
-- real schema and provisioning auth.users links. Unlinked/inactive profiles deny
-- access. No child data is deleted. Optional historical tables are hardened only
-- when present; this migration does not replace the missing baseline schema.
BEGIN;

ALTER TABLE public.catequistas ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS catequistas_auth_user_id_unique ON public.catequistas(auth_user_id) WHERE auth_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.current_catequista_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT c.id FROM public.catequistas c WHERE c.auth_user_id = (SELECT auth.uid()) AND c.active = true LIMIT 1
$$;
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.catequistas c WHERE c.auth_user_id = (SELECT auth.uid()) AND c.active = true AND c.role = 'admin')
$$;
CREATE OR REPLACE FUNCTION public.is_coordinator() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.catequistas c WHERE c.auth_user_id = (SELECT auth.uid()) AND c.active = true AND (c.role = 'coordenador' OR c.is_coordenador = true))
$$;
CREATE OR REPLACE FUNCTION public.can_manage_parish(p_parish uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.catequistas c WHERE c.auth_user_id = (SELECT auth.uid()) AND c.active = true AND
    (c.role = 'admin' OR ((c.role = 'coordenador' OR c.is_coordenador = true) AND c.paroquia_id = p_parish)))
$$;
CREATE OR REPLACE FUNCTION public.can_view_parish(p_parish uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.catequistas c WHERE c.auth_user_id = (SELECT auth.uid()) AND c.active = true AND (c.role = 'admin' OR c.paroquia_id = p_parish))
$$;
CREATE OR REPLACE FUNCTION public.can_access_student_values(p_parish uuid, p_teacher uuid, p_class text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.catequistas c WHERE c.auth_user_id = (SELECT auth.uid()) AND c.active = true AND
    (c.role = 'admin' OR (c.paroquia_id = p_parish AND
      (c.role = 'coordenador' OR c.is_coordenador = true OR
       (c.role = 'catequista' AND (p_teacher = c.id OR (p_teacher IS NULL AND c.etapa = p_class)))))))
$$;
CREATE OR REPLACE FUNCTION public.can_access_student(p_student uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.students s WHERE s.id = p_student AND public.can_access_student_values(s.paroquia_id, s.catequista_id, s.class_name))
$$;
CREATE OR REPLACE FUNCTION public.student_belongs_to_parish(p_student uuid, p_parish uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.students s WHERE s.id = p_student AND s.paroquia_id = p_parish AND public.can_access_student_values(s.paroquia_id, s.catequista_id, s.class_name))
$$;
CREATE OR REPLACE FUNCTION public.can_read_catequista(p_teacher uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.catequistas target WHERE target.id = p_teacher AND
    (target.id = public.current_catequista_id() OR public.can_manage_parish(target.paroquia_id)))
$$;

-- Serialize every change to the active linked-administrator set, including
-- service-role and auth.users FK unlink operations. An initial admin may be
-- inserted; the final active linked admin cannot be demoted/disabled/unlinked/
-- deleted. This function is VOLATILE (default): its count reads a fresh snapshot
-- after the transaction advisory lock under the normal READ COMMITTED isolation.
CREATE OR REPLACE FUNCTION public.guard_last_linked_admin() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE old_admin boolean := false; new_admin boolean := false;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_admin := COALESCE(OLD.role = 'admin' AND OLD.active = true AND OLD.auth_user_id IS NOT NULL, false); END IF;
  IF TG_OP <> 'DELETE' THEN new_admin := COALESCE(NEW.role = 'admin' AND NEW.active = true AND NEW.auth_user_id IS NOT NULL, false); END IF;
  IF old_admin OR new_admin THEN
    -- One invariant key shared by all administrator rows and transactions.
    PERFORM pg_catalog.pg_advisory_xact_lock(721050, 1);
    IF old_admin AND NOT new_admin AND pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
      RAISE EXCEPTION 'Alterações de administradores exigem uma transação READ COMMITTED.' USING ERRCODE = '23514';
    END IF;
    IF old_admin AND NOT new_admin AND
      (SELECT pg_catalog.count(*) FROM public.catequistas c WHERE c.role = 'admin' AND c.active = true AND c.auth_user_id IS NOT NULL) <= 1 THEN
      RAISE EXCEPTION 'O último administrador ativo não pode ser removido, desativado ou desvinculado.' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_last_linked_admin ON public.catequistas;
CREATE TRIGGER protect_last_linked_admin BEFORE INSERT OR UPDATE OR DELETE ON public.catequistas
  FOR EACH ROW EXECUTE FUNCTION public.guard_last_linked_admin();

-- Replace permissive policies, including unknown names, and remove inherited
-- PUBLIC grants plus any previously granted column privileges. RLS alone does
-- not revoke table privileges. Service-role provisioning remains server-only.
DO $$
DECLARE t text; p record; cols text;
BEGIN
  FOREACH t IN ARRAY ARRAY['catequistas','students','attendance','mass_attendance','pending_justifications','documentos_catequizando','activity_log','anos_catequeticos','promocoes_pendentes','calendario_eventos','paroquias','password_reset_tokens'] LOOP
    IF pg_catalog.to_regclass('public.' || t) IS NULL THEN
      RAISE WARNING 'Optional historical table public.% is absent; complete its baseline before enabling the feature', t;
      CONTINUE;
    END IF;
    EXECUTE pg_catalog.format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    FOR p IN SELECT policyname FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE pg_catalog.format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE pg_catalog.format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    SELECT pg_catalog.string_agg(pg_catalog.quote_ident(column_name), ', ') INTO cols FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t;
    IF cols IS NOT NULL THEN
      EXECUTE pg_catalog.format('REVOKE SELECT (%1$s), INSERT (%1$s), UPDATE (%1$s), REFERENCES (%1$s) ON public.%2$I FROM PUBLIC, anon, authenticated', cols, t);
    END IF;
  END LOOP;
END $$;
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

DO $$
DECLARE cols text; t text; permission text; read_permission text;
BEGIN
  -- Explicit known profile columns: legacy hashes and future private columns
  -- never enter the browser's SELECT grant. Browser writes use an audited Edge
  -- function with service credentials and its own Auth/role checks.
  SELECT pg_catalog.string_agg(pg_catalog.quote_ident(column_name), ', ') INTO cols FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'catequistas' AND column_name = ANY(ARRAY['id','name','username','email','role','etapa','active','created_at','paroquia_id','is_coordenador','monitorar_missas','auth_user_id']);
  EXECUTE pg_catalog.format('GRANT SELECT (%s) ON public.catequistas TO authenticated', cols);
  CREATE POLICY staff_profiles_read ON public.catequistas FOR SELECT TO authenticated USING (public.can_read_catequista(id));
  -- Only year coordinators may change stage. All identity, role, password and
  -- Auth-link columns remain unwritable from the browser.
  GRANT UPDATE (etapa) ON public.catequistas TO authenticated;
  CREATE POLICY coordinator_stage_update ON public.catequistas FOR UPDATE TO authenticated
    USING (public.can_manage_parish(paroquia_id)) WITH CHECK (public.can_manage_parish(paroquia_id));

  FOREACH t IN ARRAY ARRAY['students','attendance','mass_attendance','pending_justifications','documentos_catequizando'] LOOP
    IF pg_catalog.to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    permission := CASE WHEN t = 'students' THEN 'public.can_access_student_values(paroquia_id, catequista_id, class_name)' ELSE 'public.can_access_student(student_id)' END;
    EXECUTE pg_catalog.format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE pg_catalog.format('CREATE POLICY staff_read ON public.%I FOR SELECT TO authenticated USING (%s)', t, permission);
    EXECUTE pg_catalog.format('CREATE POLICY staff_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)', t, permission);
    EXECUTE pg_catalog.format('CREATE POLICY staff_update ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', t, permission, permission);
    -- Students use soft deletion in the app; physical deletion is admin-only.
    EXECUTE pg_catalog.format('CREATE POLICY staff_delete ON public.%I FOR DELETE TO authenticated USING (%s)', t, CASE WHEN t = 'students' THEN 'public.is_admin()' ELSE permission END);
  END LOOP;

  IF pg_catalog.to_regclass('public.promocoes_pendentes') IS NOT NULL THEN
    ALTER TABLE public.promocoes_pendentes ADD COLUMN IF NOT EXISTS destino_class_name text;
    ALTER TABLE public.promocoes_pendentes ADD COLUMN IF NOT EXISTS destino_catequista_id uuid REFERENCES public.catequistas(id) ON DELETE SET NULL;
  END IF;

  FOREACH t IN ARRAY ARRAY['anos_catequeticos','promocoes_pendentes'] LOOP
    IF pg_catalog.to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    read_permission := 'public.can_manage_parish(paroquia_id)';
    IF t = 'promocoes_pendentes' THEN read_permission := read_permission || ' AND public.student_belongs_to_parish(student_id, paroquia_id)'; END IF;
    permission := read_permission;
    IF t = 'promocoes_pendentes' THEN
      permission := permission || ' AND (destino_catequista_id IS NULL OR EXISTS (SELECT 1 FROM public.catequistas target WHERE target.id = destino_catequista_id AND target.paroquia_id = promocoes_pendentes.paroquia_id AND target.active = true AND target.role = ''catequista''))';
    END IF;
    EXECUTE pg_catalog.format('GRANT SELECT, INSERT, UPDATE ON public.%I TO authenticated', t);
    EXECUTE pg_catalog.format('CREATE POLICY coordinator_read ON public.%I FOR SELECT TO authenticated USING (%s)', t, read_permission);
    EXECUTE pg_catalog.format('CREATE POLICY coordinator_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)', t, permission);
    EXECUTE pg_catalog.format('CREATE POLICY coordinator_update ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', t, read_permission, permission);
  END LOOP;

  IF pg_catalog.to_regclass('public.activity_log') IS NOT NULL THEN
    GRANT SELECT, INSERT ON public.activity_log TO authenticated;
    CREATE POLICY audit_read ON public.activity_log FOR SELECT TO authenticated USING (
      public.is_admin() OR (public.is_coordinator() AND public.can_read_catequista(catequista_id)));
    CREATE POLICY audit_insert ON public.activity_log FOR INSERT TO authenticated WITH CHECK (catequista_id = public.current_catequista_id());
  END IF;
  IF pg_catalog.to_regclass('public.paroquias') IS NOT NULL THEN
    GRANT SELECT (id, nome, ativa) ON public.paroquias TO anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.paroquias TO authenticated;
    CREATE POLICY public_active_parishes ON public.paroquias FOR SELECT TO anon USING (ativa = true);
    CREATE POLICY staff_parishes ON public.paroquias FOR SELECT TO authenticated USING (ativa = true OR public.is_admin() OR public.can_manage_parish(id));
    CREATE POLICY admin_parishes_write ON public.paroquias FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;
  IF pg_catalog.to_regclass('public.calendario_eventos') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendario_eventos TO authenticated;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'calendario_eventos' AND column_name = 'paroquia_id') THEN
      permission := 'public.can_manage_parish(paroquia_id)';
      CREATE POLICY staff_calendar_read ON public.calendario_eventos FOR SELECT TO authenticated USING (public.can_view_parish(paroquia_id));
    ELSE
      -- Legacy calendar is global: do not give any parish authority over another.
      permission := 'public.is_admin()';
      CREATE POLICY staff_calendar_read ON public.calendario_eventos FOR SELECT TO authenticated USING (public.current_catequista_id() IS NOT NULL);
    END IF;
    EXECUTE pg_catalog.format('CREATE POLICY calendar_insert ON public.calendario_eventos FOR INSERT TO authenticated WITH CHECK (%s)', permission);
    EXECUTE pg_catalog.format('CREATE POLICY calendar_update ON public.calendario_eventos FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', permission, permission);
    EXECUTE pg_catalog.format('CREATE POLICY calendar_delete ON public.calendario_eventos FOR DELETE TO authenticated USING (%s)', permission);
  END IF;
  IF pg_catalog.to_regclass('public.v_logins_suspeitos') IS NOT NULL THEN
    REVOKE ALL ON public.v_logins_suspeitos FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

-- All existing SECURITY DEFINER RPCs lose browser/public execution. Only the
-- narrow helpers and validated justification RPC below are re-granted.
DO $$ DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::pg_catalog.regprocedure AS signature FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.prosecdef LOOP
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.signature);
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.current_catequista_id(), public.is_admin(), public.is_coordinator(), public.can_manage_parish(uuid), public.can_view_parish(uuid), public.student_belongs_to_parish(uuid,uuid), public.can_access_student_values(uuid,uuid,text), public.can_access_student(uuid), public.can_read_catequista(uuid) TO authenticated;

-- Private attempt counters contain no names or phone text and have no browser
-- access. Atomic conflict updates prevent parallel requests bypassing the cap.
CREATE TABLE IF NOT EXISTS public.public_justification_attempts (
  fingerprint text NOT NULL,
  hour_bucket timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 1,
  PRIMARY KEY (fingerprint, hour_bucket)
);
ALTER TABLE public.public_justification_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.public_justification_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.public_justification_attempts TO service_role;

CREATE OR REPLACE FUNCTION public.submit_public_justification(
  student_name text, guardian_contact text, date date, reason text, paroquia_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_column
DECLARE
  v_name text := pg_catalog.regexp_replace(pg_catalog.lower(pg_catalog.btrim(student_name)), '\s+', ' ', 'g');
  v_phone text := pg_catalog.regexp_replace(guardian_contact, '[^0-9]', '', 'g');
  v_reason text := pg_catalog.btrim(reason);
  v_student uuid;
  v_matches integer;
  v_attempts integer;
  v_status text;
BEGIN
  -- Neutral response for accepted, invalid, unmatched, and rate-limited input;
  -- the caller cannot use this RPC to enumerate children or their contacts.
  IF v_name IS NULL OR pg_catalog.length(v_name) NOT BETWEEN 2 AND 200 OR
     v_phone IS NULL OR pg_catalog.length(v_phone) NOT BETWEEN 10 AND 15 OR
     v_reason IS NULL OR pg_catalog.length(v_reason) NOT BETWEEN 3 AND 500 OR
     $3 IS NULL OR $3 < CURRENT_DATE - 366 OR $3 > CURRENT_DATE + 30 OR $5 IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', true);
  END IF;
  INSERT INTO public.public_justification_attempts(fingerprint, hour_bucket) VALUES (
    pg_catalog.md5($5::text || ':' || v_phone), pg_catalog.date_trunc('hour', pg_catalog.now()))
  ON CONFLICT (fingerprint, hour_bucket) DO UPDATE SET attempts = public.public_justification_attempts.attempts + 1
  RETURNING attempts INTO v_attempts;
  IF v_attempts > 5 THEN RETURN pg_catalog.jsonb_build_object('success', true); END IF;
  -- Cleanup affects only counters, never attendance/history.
  DELETE FROM public.public_justification_attempts WHERE hour_bucket < pg_catalog.now() - INTERVAL '48 hours';
  SELECT pg_catalog.count(*), pg_catalog.min(s.id::text)::uuid INTO v_matches, v_student FROM public.students s JOIN public.paroquias p ON p.id = s.paroquia_id AND p.ativa = true
    WHERE s.active = true AND s.paroquia_id = $5
      AND pg_catalog.regexp_replace(pg_catalog.lower(pg_catalog.btrim(s.name)), '\s+', ' ', 'g') = v_name
      AND pg_catalog.regexp_replace(s.phone, '[^0-9]', '', 'g') = v_phone;
  IF v_matches <> 1 OR v_student IS NULL THEN RETURN pg_catalog.jsonb_build_object('success', true); END IF;
  -- Serialize duplicate requests for this student, including the missing-row case.
  PERFORM 1 FROM public.students WHERE id = v_student FOR UPDATE;
  SELECT a.status INTO v_status FROM public.attendance a WHERE a.student_id = v_student AND a.date = $3 FOR UPDATE;
  IF v_status IN ('falta_nao_justificada', 'falta_justificada') THEN
    UPDATE public.attendance SET status = 'falta_justificada', justification_reason = v_reason WHERE student_id = v_student AND public.attendance.date = $3;
  ELSIF v_status IS NULL THEN
    INSERT INTO public.pending_justifications(student_id, date, reason, paroquia_id)
      VALUES (v_student, $3, v_reason, $5)
      ON CONFLICT (student_id, date) DO UPDATE SET reason = EXCLUDED.reason, paroquia_id = EXCLUDED.paroquia_id;
  END IF;
  RETURN pg_catalog.jsonb_build_object('success', true);
END $$;
REVOKE ALL ON FUNCTION public.submit_public_justification(text,text,date,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_justification(text,text,date,text,uuid) TO anon, authenticated;

COMMIT;
