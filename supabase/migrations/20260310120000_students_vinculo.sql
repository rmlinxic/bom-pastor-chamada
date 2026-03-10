-- Adiciona colunas de vínculo nos alunos (não-destrutivo)
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS catequista_id UUID REFERENCES public.catequistas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS paroquia_id  UUID REFERENCES public.paroquias(id)   ON DELETE SET NULL;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_students_catequista_id ON public.students(catequista_id);
CREATE INDEX IF NOT EXISTS idx_students_paroquia_id  ON public.students(paroquia_id);

-- Migração automática: preenche paroquia_id e catequista_id para alunos existentes
-- baseado no class_name = catequista.etapa
UPDATE public.students s
SET
  catequista_id = c.id,
  paroquia_id   = c.paroquia_id
FROM public.catequistas c
WHERE s.catequista_id IS NULL
  AND s.active = TRUE
  AND c.active = TRUE
  AND c.role = 'catequista'
  AND c.etapa IS NOT NULL
  AND LOWER(s.class_name) = LOWER(c.etapa);
