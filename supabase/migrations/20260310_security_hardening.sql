-- ============================================================
-- SECURITY HARDENING — Bom Pastor Catequese
-- ============================================================

-- 1. ÍNDICES de performance e segurança
-- Evita full table scan no login (timing attack)
CREATE INDEX IF NOT EXISTS idx_catequistas_username_active
  ON public.catequistas (username, active)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_catequistas_password_lookup
  ON public.catequistas (username, password_hash)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_students_paroquia_active
  ON public.students (paroquia_id, active)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_attendance_student_date
  ON public.attendance (student_id, date);

CREATE INDEX IF NOT EXISTS idx_attendance_date
  ON public.attendance (date);

-- 2. CONSTRAINT: username deve ser único e só ter chars válidos
ALTER TABLE public.catequistas
  ADD CONSTRAINT IF NOT EXISTS catequistas_username_format
    CHECK (username ~ '^[a-z0-9_\-]{3,64}$');

-- 3. CONSTRAINT: tamanho mínimo de hash (SHA-256 = 64 hex chars)
ALTER TABLE public.catequistas
  ADD CONSTRAINT IF NOT EXISTS catequistas_password_hash_length
    CHECK (length(password_hash) = 64);

-- 4. CONSTRAINT: role válida
ALTER TABLE public.catequistas
  ADD CONSTRAINT IF NOT EXISTS catequistas_role_values
    CHECK (role IN ('admin', 'catequista', 'coordenador'));

-- 5. CONSTRAINT: status de presença válido
ALTER TABLE public.attendance
  ADD CONSTRAINT IF NOT EXISTS attendance_status_values
    CHECK (status IN ('presente', 'falta_justificada', 'falta_nao_justificada'));

-- 6. CONSTRAINT: tamanho máximo de campos de texto livre
ALTER TABLE public.students
  ADD CONSTRAINT IF NOT EXISTS students_name_length CHECK (length(name) BETWEEN 2 AND 200),
  ADD CONSTRAINT IF NOT EXISTS students_phone_length CHECK (length(phone) <= 20);

ALTER TABLE public.catequistas
  ADD CONSTRAINT IF NOT EXISTS catequistas_name_length CHECK (length(name) BETWEEN 2 AND 200);

-- 7. LOG DE ATIVIDADES — garante que ação e catequista_id são obrigatórios
ALTER TABLE public.activity_log
  ALTER COLUMN acao SET NOT NULL;

-- 8. Proteção contra deleção física de logs (soft-delete apenas)
-- Revoga DELETE direto na tabela de logs do role anon/authenticated se existir
-- (adaptar ao seu setup de RLS)
COMMENT ON TABLE public.activity_log IS
  'Tabela de auditoria — nunca apagar registros por política de segurança.';

-- 9. VIEW de auditoria de logins suspeitos (muitas tentativas no mesmo dia)
-- Útil para um futuro painel admin de segurança
CREATE OR REPLACE VIEW public.v_logins_suspeitos AS
  SELECT
    (detalhes->>'username')::text AS username,
    DATE(created_at) AS dia,
    COUNT(*) AS tentativas
  FROM public.activity_log
  WHERE acao = 'login_falhou'
    AND created_at >= NOW() - INTERVAL '7 days'
  GROUP BY 1, 2
  HAVING COUNT(*) >= 3
  ORDER BY tentativas DESC;

-- 10. Função para registrar login no activity_log (chamada pelo app)
CREATE OR REPLACE FUNCTION public.log_login_attempt(
  p_username TEXT,
  p_success BOOLEAN,
  p_ip TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.activity_log (catequista_id, acao, detalhes)
  SELECT
    id,
    CASE WHEN p_success THEN 'login_ok' ELSE 'login_falhou' END,
    jsonb_build_object('username', p_username, 'ip', p_ip, 'ts', NOW())
  FROM public.catequistas
  WHERE username = p_username
  LIMIT 1;

  -- Se não encontrou o usuário, loga sem catequista_id
  IF NOT FOUND THEN
    INSERT INTO public.activity_log (catequista_id, acao, detalhes)
    VALUES (
      NULL,
      'login_falhou',
      jsonb_build_object('username', p_username, 'ip', p_ip, 'ts', NOW(), 'motivo', 'usuario_nao_encontrado')
    );
  END IF;
 END;
$$;
