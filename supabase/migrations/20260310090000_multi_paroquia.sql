-- =============================================================
-- MIGRAÇÃO: Suporte a múltiplas paróquias + role coordenador
-- Segura para dados existentes — apenas adiciona, nunca remove.
-- ANTES de rodar, exporte os dados com as queries no final.
-- =============================================================

-- 1. Criar tabela de paróquias
CREATE TABLE IF NOT EXISTS public.paroquias (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  ativa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.paroquias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view paroquias" ON public.paroquias
  FOR SELECT USING (true);
CREATE POLICY "Anyone can insert paroquias" ON public.paroquias
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update paroquias" ON public.paroquias
  FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete paroquias" ON public.paroquias
  FOR DELETE USING (true);

-- 2. Adicionar paroquia_id na tabela catequistas
ALTER TABLE public.catequistas
  ADD COLUMN IF NOT EXISTS paroquia_id UUID
  REFERENCES public.paroquias(id) ON DELETE SET NULL;

-- 3. Atualizar constraint de role para incluir 'coordenador'
ALTER TABLE public.catequistas DROP CONSTRAINT IF EXISTS catequistas_role_check;
ALTER TABLE public.catequistas
  ADD CONSTRAINT catequistas_role_check
  CHECK (role IN ('admin', 'catequista', 'coordenador'));

-- 4. Adicionar colunas em students
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS paroquia_id UUID
  REFERENCES public.paroquias(id) ON DELETE SET NULL;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS catequista_id UUID
  REFERENCES public.catequistas(id) ON DELETE SET NULL;

-- 5. Adicionar colunas em pending_justifications
ALTER TABLE public.pending_justifications
  ADD COLUMN IF NOT EXISTS paroquia_id UUID
  REFERENCES public.paroquias(id) ON DELETE SET NULL;

ALTER TABLE public.pending_justifications
  ADD COLUMN IF NOT EXISTS paroquia_nome TEXT;

-- 6. Índices de performance
CREATE INDEX IF NOT EXISTS idx_catequistas_paroquia ON public.catequistas(paroquia_id);
CREATE INDEX IF NOT EXISTS idx_students_paroquia ON public.students(paroquia_id);
CREATE INDEX IF NOT EXISTS idx_students_catequista ON public.students(catequista_id);

-- =============================================================
-- QUERIES DE BACKUP (rode ANTES da migração e salve os CSVs)
-- =============================================================
-- SELECT * FROM public.catequistas;
-- SELECT * FROM public.students;
-- SELECT * FROM public.attendance;
-- SELECT * FROM public.pending_justifications;
-- =============================================================
