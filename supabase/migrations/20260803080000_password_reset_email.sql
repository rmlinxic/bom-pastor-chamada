-- ============================================================
-- MIGRAÇÃO: Esqueci minha senha + campo email
-- Adiciona coluna email à tabela catequistas,
-- cria tabela de tokens de reset e funções RPC.
-- ============================================================

-- 1. Adicionar coluna email na tabela catequistas
ALTER TABLE public.catequistas
  ADD COLUMN IF NOT EXISTS email TEXT;

-- Índice único para email (ignorando nulos)
CREATE UNIQUE INDEX IF NOT EXISTS idx_catequistas_email_unique
  ON public.catequistas (email)
  WHERE email IS NOT NULL;

-- 2. Criar tabela de tokens de reset de senha
CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  catequista_id UUID NOT NULL REFERENCES public.catequistas(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view reset tokens" ON public.password_reset_tokens
  FOR SELECT USING (true);
CREATE POLICY "Anyone can insert reset tokens" ON public.password_reset_tokens
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update reset tokens" ON public.password_reset_tokens
  FOR UPDATE USING (true);

-- Índice para busca por token
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token
  ON public.password_reset_tokens (token)
  WHERE used = false;

-- Índice para limpeza de tokens expirados
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires
  ON public.password_reset_tokens (expires_at)
  WHERE used = false;

-- 3. Função RPC: Redefinir senha por e-mail
-- Chamada pelo frontend após o usuário clicar no link de reset
CREATE OR REPLACE FUNCTION public.reset_password_by_email(
  p_email TEXT,
  p_new_password_hash TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_catequista_id UUID;
BEGIN
  -- Validação básica
  IF p_email IS NULL OR p_email = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'E-mail é obrigatório');
  END IF;

  IF p_new_password_hash IS NULL OR length(p_new_password_hash) <> 64 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Hash de senha inválido');
  END IF;

  -- Busca o catequista pelo e-mail
  SELECT id INTO v_catequista_id
  FROM public.catequistas
  WHERE LOWER(email) = LOWER(p_email)
    AND active = true;

  IF v_catequista_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'E-mail não encontrado');
  END IF;

  -- Atualiza a senha
  UPDATE public.catequistas
  SET password_hash = p_new_password_hash
  WHERE id = v_catequista_id;

  -- Log da ação
  INSERT INTO public.activity_log (catequista_id, acao, detalhes)
  VALUES (
    v_catequista_id,
    'senha_redefinida',
    jsonb_build_object('via', 'email_reset', 'email', p_email, 'ts', NOW())
  );

  RETURN jsonb_build_object('success', true, 'message', 'Senha redefinida com sucesso');
END;
$$;

-- 4. Função para limpar tokens expirados (pode ser chamada periodicamente)
CREATE OR REPLACE FUNCTION public.cleanup_expired_tokens()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.password_reset_tokens
  WHERE expires_at < NOW() OR used = true;
END;
$$;

-- 5. Atualizar email da catequista Juliana
UPDATE public.catequistas
SET email = 'julianapetry@gmail.com'
WHERE LOWER(name) LIKE '%juliana%'
  AND active = true;
