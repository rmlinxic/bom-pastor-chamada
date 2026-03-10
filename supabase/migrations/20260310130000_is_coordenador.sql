-- Adiciona flag de coordenador sem quebrar o role existente
ALTER TABLE public.catequistas
  ADD COLUMN IF NOT EXISTS is_coordenador BOOLEAN NOT NULL DEFAULT FALSE;

-- Quem já é coordenador exclusivo também recebe a flag
UPDATE public.catequistas
  SET is_coordenador = TRUE
  WHERE role = 'coordenador';
