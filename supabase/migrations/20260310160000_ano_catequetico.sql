-- ==========================================================
-- MIGRAÇÃO: Ano Catequético
-- Cole e execute no SQL Editor do Supabase (Project > SQL Editor)
-- Seguro para re-executar: usa IF NOT EXISTS em tudo
-- ==========================================================

-- 1. Cria mass_attendance se ainda não existir
CREATE TABLE IF NOT EXISTS public.mass_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE,
  date date NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(student_id, date)
);

-- 2. Tabela de controle de anos catequéticos por paróquia
CREATE TABLE IF NOT EXISTS public.anos_catequeticos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paroquia_id uuid REFERENCES public.paroquias(id) ON DELETE CASCADE,
  ano integer NOT NULL,
  iniciado_em timestamptz DEFAULT now(),
  encerrado_em timestamptz,
  ativo boolean DEFAULT true,
  UNIQUE(paroquia_id, ano)
);

-- 3. Colunas de ano catequético para histórico (ignoradas se já existirem)
ALTER TABLE public.students     ADD COLUMN IF NOT EXISTS ano_catequetico integer;
ALTER TABLE public.attendance   ADD COLUMN IF NOT EXISTS ano_catequetico integer;
ALTER TABLE public.mass_attendance ADD COLUMN IF NOT EXISTS ano_catequetico integer;

-- 4. Tabela de promoções manuais pendentes
CREATE TABLE IF NOT EXISTS public.promocoes_pendentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE,
  paroquia_id uuid REFERENCES public.paroquias(id) ON DELETE CASCADE,
  ano_catequetico integer NOT NULL,
  faltas_nao_justificadas integer NOT NULL DEFAULT 0,
  meses_sem_missa integer NOT NULL DEFAULT 0,
  score_faltas integer NOT NULL DEFAULT 0,
  decisao text CHECK (decisao IN ('promovido', 'retido', NULL)),
  decidido_por uuid,
  decidido_em timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(student_id, ano_catequetico)
);

-- 5. Tabela de log de atividades
CREATE TABLE IF NOT EXISTS public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catequista_id uuid REFERENCES public.catequistas(id) ON DELETE SET NULL,
  acao text NOT NULL,
  detalhes jsonb,
  created_at timestamptz DEFAULT now()
);

-- 6. Índices
CREATE INDEX IF NOT EXISTS idx_activity_log_created    ON public.activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_promocoes_paroquia      ON public.promocoes_pendentes(paroquia_id, ano_catequetico);
CREATE INDEX IF NOT EXISTS idx_mass_attendance_student ON public.mass_attendance(student_id, date);
