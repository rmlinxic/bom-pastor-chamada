-- Permite que cada catequista escolha se deseja acompanhar a presença nas missas.
ALTER TABLE public.catequistas
  ADD COLUMN IF NOT EXISTS monitorar_missas BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.catequistas.monitorar_missas IS
  'Define se o catequista usa alertas, atalhos e relatórios de monitoramento de missas.';
