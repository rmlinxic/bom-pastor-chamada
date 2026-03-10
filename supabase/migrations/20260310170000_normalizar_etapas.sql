-- ==========================================================
-- MIGRATION: Normalizar nomes de etapas
-- Cole e execute no SQL Editor do Supabase
-- Atualiza alunos e catequistas que usavam nomes antigos/variantes
-- ==========================================================

-- Mapeamento de variantes antigas para os nomes canônicos
-- Ajuste as variantes conforme o que está no seu banco
UPDATE public.students SET class_name = 'Primeira Etapa'
  WHERE lower(trim(class_name)) IN (
    'primeira etapa', '1ª etapa', '1a etapa', 'etapa 1', 'etapa i', '1 etapa', 'primeiro ano'
  );

UPDATE public.students SET class_name = 'Segunda Etapa'
  WHERE lower(trim(class_name)) IN (
    'segunda etapa', '2ª etapa', '2a etapa', 'etapa 2', 'etapa ii', '2 etapa', 'segundo ano'
  );

UPDATE public.students SET class_name = 'Terceira Etapa'
  WHERE lower(trim(class_name)) IN (
    'terceira etapa', '3ª etapa', '3a etapa', 'etapa 3', 'etapa iii', '3 etapa', 'terceiro ano'
  );

UPDATE public.students SET class_name = 'Quarta Etapa'
  WHERE lower(trim(class_name)) IN (
    'quarta etapa', '4ª etapa', '4a etapa', 'etapa 4', 'etapa iv', '4 etapa', 'quarto ano'
  );

UPDATE public.students SET class_name = 'Quinta Etapa'
  WHERE lower(trim(class_name)) IN (
    'quinta etapa', '5ª etapa', '5a etapa', 'etapa 5', 'etapa v', '5 etapa', 'quinto ano'
  );

UPDATE public.students SET class_name = 'Crisma'
  WHERE lower(trim(class_name)) IN (
    'crisma', 'crisma etapa', 'etapa crisma', 'confirmação', 'confirmacao'
  );

-- Mesma normalização para catequistas
UPDATE public.catequistas SET etapa = 'Primeira Etapa'
  WHERE lower(trim(etapa)) IN (
    'primeira etapa', '1ª etapa', '1a etapa', 'etapa 1', 'etapa i', '1 etapa', 'primeiro ano'
  );

UPDATE public.catequistas SET etapa = 'Segunda Etapa'
  WHERE lower(trim(etapa)) IN (
    'segunda etapa', '2ª etapa', '2a etapa', 'etapa 2', 'etapa ii', '2 etapa', 'segundo ano'
  );

UPDATE public.catequistas SET etapa = 'Terceira Etapa'
  WHERE lower(trim(etapa)) IN (
    'terceira etapa', '3ª etapa', '3a etapa', 'etapa 3', 'etapa iii', '3 etapa', 'terceiro ano'
  );

UPDATE public.catequistas SET etapa = 'Quarta Etapa'
  WHERE lower(trim(etapa)) IN (
    'quarta etapa', '4ª etapa', '4a etapa', 'etapa 4', 'etapa iv', '4 etapa', 'quarto ano'
  );

UPDATE public.catequistas SET etapa = 'Quinta Etapa'
  WHERE lower(trim(etapa)) IN (
    'quinta etapa', '5ª etapa', '5a etapa', 'etapa 5', 'etapa v', '5 etapa', 'quinto ano'
  );

UPDATE public.catequistas SET etapa = 'Crisma'
  WHERE lower(trim(etapa)) IN (
    'crisma', 'crisma etapa', 'etapa crisma', 'confirmação', 'confirmacao'
  );

-- Verificação: mostra o que ficou fora dos nomes canônicos (deveria retornar 0 linhas)
SELECT 'students' as tabela, class_name, count(*) FROM public.students
  WHERE class_name NOT IN ('Primeira Etapa','Segunda Etapa','Terceira Etapa','Quarta Etapa','Quinta Etapa','Crisma')
  AND active = true
  GROUP BY class_name
UNION ALL
SELECT 'catequistas', etapa, count(*) FROM public.catequistas
  WHERE etapa NOT IN ('Primeira Etapa','Segunda Etapa','Terceira Etapa','Quarta Etapa','Quinta Etapa','Crisma')
  AND active = true AND etapa IS NOT NULL
  GROUP BY etapa;
