-- Propaga paroquia_id do catequista para todos os alunos vinculados
UPDATE public.students s
SET paroquia_id = c.paroquia_id
FROM public.catequistas c
WHERE s.catequista_id = c.id
  AND c.paroquia_id IS NOT NULL
  AND (s.paroquia_id IS NULL OR s.paroquia_id != c.paroquia_id);

-- Fallback: alunos sem catequista_id mas com class_name igual a etapa de um catequista da paroquia
UPDATE public.students s
SET
  paroquia_id = c.paroquia_id,
  catequista_id = c.id
FROM public.catequistas c
WHERE s.catequista_id IS NULL
  AND s.active = TRUE
  AND c.active = TRUE
  AND c.role = 'catequista'
  AND c.paroquia_id IS NOT NULL
  AND c.etapa IS NOT NULL
  AND LOWER(TRIM(s.class_name)) = LOWER(TRIM(c.etapa));
