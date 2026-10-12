-- Public child selection intentionally exposes only active children's names,
-- IDs and classes in an active parish. Submissions are accepted by default;
-- an explicit staff refusal persists across anonymous retries.
BEGIN;

CREATE INDEX IF NOT EXISTS public_justification_attempts_hour_idx
  ON public.public_justification_attempts(hour_bucket);

CREATE TABLE public.rejected_public_justifications (
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  date date NOT NULL,
  rejected_by uuid NOT NULL REFERENCES public.catequistas(id),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY (student_id, date)
);
ALTER TABLE public.rejected_public_justifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rejected_public_justifications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.rejected_public_justifications TO authenticated;
GRANT ALL ON public.rejected_public_justifications TO service_role;
CREATE POLICY staff_rejections_read ON public.rejected_public_justifications
  FOR SELECT TO authenticated USING (public.can_access_student(student_id));

-- Close the old phone-matching RPC: it could directly rewrite attendance.
REVOKE ALL ON FUNCTION public.submit_public_justification(text,text,date,text,uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.public_justification_classes(parish_id uuid)
RETURNS TABLE(class_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT DISTINCT s.class_name FROM public.students s
  JOIN public.paroquias p ON p.id = s.paroquia_id AND p.ativa = true
  WHERE s.active = true AND s.paroquia_id = $1
    AND pg_catalog.btrim(s.class_name) <> ''
  ORDER BY s.class_name
$$;

CREATE OR REPLACE FUNCTION public.public_justification_students(parish_id uuid, stage text)
RETURNS TABLE(id uuid, name text, class_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT s.id, s.name, s.class_name FROM public.students s
  JOIN public.paroquias p ON p.id = s.paroquia_id AND p.ativa = true
  WHERE s.active = true AND s.paroquia_id = $1
    AND pg_catalog.length(pg_catalog.btrim($2)) BETWEEN 1 AND 200
    AND (s.class_name = pg_catalog.btrim($2)
      OR pg_catalog.starts_with(s.class_name, pg_catalog.btrim($2) || ' '))
  ORDER BY s.name, s.id
$$;

CREATE OR REPLACE FUNCTION public.submit_selected_public_justification(
  student_id uuid, parish_id uuid, class_name text, absence_date date, reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_column
DECLARE
  v_reason text := pg_catalog.btrim($5);
  v_attempts integer;
  v_status text;
  v_queued_reason text;
BEGIN
  -- Identical response for invalid, duplicate, limited and accepted requests.
  IF $1 IS NULL OR $2 IS NULL OR $3 IS NULL OR
     pg_catalog.length($3) NOT BETWEEN 1 AND 200 OR $4 IS NULL OR
     $4 < CURRENT_DATE - 366 OR $4 > CURRENT_DATE + 30 OR
     v_reason IS NULL OR pg_catalog.length(v_reason) NOT BETWEEN 3 AND 500 THEN
    RETURN pg_catalog.jsonb_build_object('success', true);
  END IF;

  -- Student first is the shared lock order for submission and refusal.
  PERFORM 1 FROM public.students s
    JOIN public.paroquias p ON p.id = s.paroquia_id AND p.ativa = true
    WHERE s.id = $1 AND s.paroquia_id = $2 AND s.class_name = $3 AND s.active = true
    FOR UPDATE OF s;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('success', true); END IF;

  -- Allocate counters only for valid enrollment IDs, and keep just 48 hours.
  DELETE FROM public.public_justification_attempts
    WHERE hour_bucket < pg_catalog.now() - INTERVAL '48 hours';
  INSERT INTO public.public_justification_attempts(fingerprint, hour_bucket)
    VALUES ('selected:' || pg_catalog.md5($2::text || ':' || $1::text),
      pg_catalog.date_trunc('hour', pg_catalog.now()))
    ON CONFLICT (fingerprint, hour_bucket) DO UPDATE
      SET attempts = public.public_justification_attempts.attempts + 1
    RETURNING attempts INTO v_attempts;
  IF v_attempts > 5 THEN RETURN pg_catalog.jsonb_build_object('success', true); END IF;

  IF EXISTS (SELECT 1 FROM public.rejected_public_justifications r WHERE r.student_id = $1 AND r.date = $4) THEN
    RETURN pg_catalog.jsonb_build_object('success', true);
  END IF;
  -- Queue before attendance is also the refusal lock order.
  SELECT q.reason INTO v_queued_reason FROM public.pending_justifications q
    WHERE q.student_id = $1 AND q.date = $4 FOR UPDATE;
  SELECT a.status INTO v_status FROM public.attendance a WHERE a.student_id = $1 AND a.date = $4 FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.pending_justifications(student_id, date, reason, paroquia_id)
      VALUES ($1, $4, v_reason, $2) ON CONFLICT (student_id, date) DO NOTHING;
  ELSIF v_status = 'falta_nao_justificada' THEN
    UPDATE public.attendance SET status = 'falta_justificada', justification_reason = COALESCE(v_queued_reason, v_reason)
      WHERE student_id = $1 AND date = $4;
    DELETE FROM public.pending_justifications WHERE student_id = $1 AND date = $4;
  END IF;
  RETURN pg_catalog.jsonb_build_object('success', true);
END $$;

CREATE OR REPLACE FUNCTION public.reject_public_justification(student_id uuid, absence_date date)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_column
DECLARE v_teacher uuid;
BEGIN
  v_teacher := public.current_catequista_id();
  IF v_teacher IS NULL OR COALESCE(auth.jwt() ->> 'is_anonymous', 'false') = 'true'
     OR NOT public.can_access_student($1) THEN
    RAISE EXCEPTION 'Justificativa indisponível ou sem permissão.' USING ERRCODE = '42501';
  END IF;
  IF $2 IS NULL THEN
    RAISE EXCEPTION 'Informe a data da justificativa.' USING ERRCODE = '22004';
  END IF;
  PERFORM 1 FROM public.students s WHERE s.id = $1 FOR UPDATE;
  IF NOT FOUND OR NOT public.can_access_student($1) THEN
    RAISE EXCEPTION 'Justificativa indisponível ou sem permissão.' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.pending_justifications q WHERE q.student_id = $1 AND q.date = $2 FOR UPDATE;
  PERFORM 1 FROM public.attendance a WHERE a.student_id = $1 AND a.date = $2 FOR UPDATE;
  INSERT INTO public.rejected_public_justifications(student_id,date,rejected_by)
    VALUES ($1,$2,v_teacher) ON CONFLICT (student_id,date) DO NOTHING;
  DELETE FROM public.pending_justifications WHERE public.pending_justifications.student_id = $1 AND date = $2;
  UPDATE public.attendance SET status = 'falta_nao_justificada', justification_reason = NULL
    WHERE public.attendance.student_id = $1 AND date = $2 AND status = 'falta_justificada';
  RETURN pg_catalog.jsonb_build_object('success', true);
END $$;

-- Attendance saves use this atomic RPC instead of applying a stale client
-- snapshot of the queue after a concurrent staff refusal.
CREATE OR REPLACE FUNCTION public.apply_pending_justifications_for_attendance(student_ids uuid[], absence_date date)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_column
DECLARE
  v_student uuid;
  v_reason text;
  v_status text;
  v_applied integer := 0;
BEGIN
  IF public.current_catequista_id() IS NULL OR
     COALESCE(auth.jwt() ->> 'is_anonymous', 'false') = 'true' THEN
    RAISE EXCEPTION 'Acesso não autorizado.' USING ERRCODE = '42501';
  END IF;
  IF $1 IS NULL OR pg_catalog.cardinality($1) > 200 OR $2 IS NULL THEN
    RAISE EXCEPTION 'Informe uma data e até 200 catequizandos.' USING ERRCODE = '22023';
  END IF;
  -- Validate the entire batch before any writes; never silently accept a
  -- mixture containing a child outside the caller's scope.
  IF EXISTS (SELECT 1 FROM pg_catalog.unnest($1) AS requested(id)
    WHERE requested.id IS NULL OR NOT public.can_access_student(requested.id)) THEN
    RAISE EXCEPTION 'Catequizando indisponível ou sem permissão.' USING ERRCODE = '42501';
  END IF;
  FOR v_student IN SELECT DISTINCT requested.id FROM pg_catalog.unnest($1) AS requested(id) ORDER BY requested.id LOOP
    PERFORM 1 FROM public.students s WHERE s.id = v_student FOR UPDATE;
    IF NOT FOUND OR NOT public.can_access_student(v_student) THEN
      RAISE EXCEPTION 'Catequizando indisponível ou sem permissão.' USING ERRCODE = '42501';
    END IF;
    SELECT q.reason INTO v_reason FROM public.pending_justifications q
      WHERE q.student_id = v_student AND q.date = $2 FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;
    SELECT a.status INTO v_status FROM public.attendance a
      WHERE a.student_id = v_student AND a.date = $2 FOR UPDATE;
    IF NOT FOUND OR v_status <> 'falta_nao_justificada' OR EXISTS (
      SELECT 1 FROM public.rejected_public_justifications r WHERE r.student_id = v_student AND r.date = $2
    ) THEN CONTINUE; END IF;
    UPDATE public.attendance SET status = 'falta_justificada', justification_reason = v_reason
      WHERE public.attendance.student_id = v_student AND date = $2;
    DELETE FROM public.pending_justifications WHERE public.pending_justifications.student_id = v_student AND date = $2;
    v_applied := v_applied + 1;
  END LOOP;
  RETURN v_applied;
END $$;

-- Save fresh attendance and consume accepted queues within one transaction.
-- Only explicit staff choices may replace an existing status; inherited UI
-- snapshots cannot undo a concurrent justification or refusal.
CREATE OR REPLACE FUNCTION public.save_catechesis_attendance(records jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_record record;
  v_student uuid;
  v_date date;
  v_status text;
  v_ids uuid[];
  v_applied integer := 0;
BEGIN
  IF public.current_catequista_id() IS NULL OR
     COALESCE(auth.jwt() ->> 'is_anonymous', 'false') = 'true' THEN
    RAISE EXCEPTION 'Acesso não autorizado.' USING ERRCODE = '42501';
  END IF;
  IF $1 IS NULL OR pg_catalog.jsonb_typeof($1) <> 'array' THEN
    RAISE EXCEPTION 'Informe uma lista de chamadas.' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.jsonb_array_length($1) > 200 THEN
    RAISE EXCEPTION 'Envie até 200 registros de chamada.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements($1) AS input(value)
    WHERE pg_catalog.jsonb_typeof(input.value) <> 'object'
      OR pg_catalog.jsonb_typeof(input.value -> 'student_id') IS DISTINCT FROM 'string'
      OR pg_catalog.jsonb_typeof(input.value -> 'date') IS DISTINCT FROM 'string'
      OR (input.value ->> 'date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      OR pg_catalog.jsonb_typeof(input.value -> 'status') IS DISTINCT FROM 'string'
      OR (input.value ->> 'status') NOT IN ('presente','falta_justificada','falta_nao_justificada')
      OR pg_catalog.jsonb_typeof(input.value -> 'explicit_status') IS DISTINCT FROM 'boolean') THEN
    RAISE EXCEPTION 'Registro de chamada inválido.' USING ERRCODE = '22023';
  END IF;
  -- Typed conversion and duplicate validation precede every mutation.
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_to_recordset($1)
      AS input(student_id uuid, date date, status text, explicit_status boolean)
      GROUP BY input.student_id,input.date HAVING pg_catalog.count(*) > 1) THEN
      RAISE EXCEPTION 'Chamada duplicada no mesmo envio.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_to_recordset($1)
      AS input(student_id uuid, date date, status text, explicit_status boolean)
      WHERE input.student_id IS NULL OR NOT public.can_access_student(input.student_id)) THEN
      RAISE EXCEPTION 'Catequizando indisponível ou sem permissão.' USING ERRCODE = '42501';
    END IF;
  EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'Registro de chamada inválido.' USING ERRCODE = '22023';
  END;
  FOR v_student IN SELECT DISTINCT input.student_id FROM pg_catalog.jsonb_to_recordset($1)
    AS input(student_id uuid, date date, status text, explicit_status boolean) ORDER BY input.student_id LOOP
    PERFORM 1 FROM public.students s WHERE s.id = v_student FOR UPDATE;
    IF NOT FOUND OR NOT public.can_access_student(v_student) THEN
      RAISE EXCEPTION 'Catequizando indisponível ou sem permissão.' USING ERRCODE = '42501';
    END IF;
  END LOOP;
  -- Keep student -> pending -> attendance order shared by all queue RPCs.
  PERFORM q.id FROM public.pending_justifications q JOIN pg_catalog.jsonb_to_recordset($1)
    AS input(student_id uuid, date date, status text, explicit_status boolean)
    ON q.student_id = input.student_id AND q.date = input.date
    ORDER BY q.student_id,q.date FOR UPDATE OF q;
  PERFORM a.id FROM public.attendance a JOIN pg_catalog.jsonb_to_recordset($1)
    AS input(student_id uuid, date date, status text, explicit_status boolean)
    ON a.student_id = input.student_id AND a.date = input.date
    ORDER BY a.student_id,a.date FOR UPDATE OF a;
  FOR v_record IN SELECT input.* FROM pg_catalog.jsonb_to_recordset($1)
    AS input(student_id uuid, date date, status text, explicit_status boolean) ORDER BY input.student_id,input.date LOOP
    PERFORM 1 FROM public.attendance a WHERE a.student_id = v_record.student_id AND a.date = v_record.date;
    IF FOUND THEN
      IF v_record.explicit_status THEN
        UPDATE public.attendance a SET status = v_record.status,
          justification_reason = CASE WHEN v_record.status = 'falta_justificada' THEN a.justification_reason ELSE NULL END
          WHERE a.student_id = v_record.student_id AND a.date = v_record.date;
      END IF;
    ELSE
      v_status := v_record.status;
      IF NOT v_record.explicit_status AND v_status = 'falta_justificada' AND EXISTS (
        SELECT 1 FROM public.rejected_public_justifications r
        WHERE r.student_id = v_record.student_id AND r.date = v_record.date
      ) THEN v_status := 'falta_nao_justificada'; END IF;
      INSERT INTO public.attendance(student_id,date,status)
        VALUES (v_record.student_id,v_record.date,v_status);
    END IF;
  END LOOP;
  FOR v_date IN SELECT DISTINCT input.date FROM pg_catalog.jsonb_to_recordset($1)
    AS input(student_id uuid, date date, status text, explicit_status boolean) ORDER BY input.date LOOP
    SELECT pg_catalog.array_agg(input.student_id ORDER BY input.student_id) INTO v_ids
      FROM pg_catalog.jsonb_to_recordset($1)
      AS input(student_id uuid, date date, status text, explicit_status boolean) WHERE input.date = v_date;
    v_applied := v_applied + public.apply_pending_justifications_for_attendance(v_ids,v_date);
  END LOOP;
  RETURN v_applied;
END $$;

REVOKE ALL ON FUNCTION public.public_justification_classes(uuid),
  public.public_justification_students(uuid,text),
  public.submit_selected_public_justification(uuid,uuid,text,date,text),
  public.reject_public_justification(uuid,date),
  public.apply_pending_justifications_for_attendance(uuid[],date),
  public.save_catechesis_attendance(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_justification_classes(uuid),
  public.public_justification_students(uuid,text),
  public.submit_selected_public_justification(uuid,uuid,text,date,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reject_public_justification(uuid,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_pending_justifications_for_attendance(uuid[],date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_catechesis_attendance(jsonb) TO authenticated;

COMMIT;
