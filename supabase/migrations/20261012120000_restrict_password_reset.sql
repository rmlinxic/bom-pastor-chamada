-- Aplicar em staging antes de produção. O login legado ainda precisa de Auth + RLS.
BEGIN;

CREATE OR REPLACE FUNCTION public.reset_password_by_email(p_email TEXT, p_new_password_hash TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email TEXT;
  v_catequista_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticação obrigatória' USING ERRCODE = '42501';
  END IF;

  SELECT lower(u.email) INTO v_email
  FROM auth.users u
  WHERE u.id = auth.uid() AND u.email_confirmed_at IS NOT NULL;

  IF v_email IS NULL OR p_email IS NULL OR lower(trim(p_email)) <> v_email THEN
    RAISE EXCEPTION 'Não é permitido alterar a senha desta conta' USING ERRCODE = '42501';
  END IF;

  IF p_new_password_hash IS NULL OR p_new_password_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Hash de senha inválido');
  END IF;

  UPDATE public.catequistas
  SET password_hash = p_new_password_hash
  WHERE lower(email) = v_email AND active = true
  RETURNING id INTO v_catequista_id;

  IF v_catequista_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Conta não encontrada');
  END IF;

  INSERT INTO public.activity_log (catequista_id, acao, detalhes)
  VALUES (v_catequista_id, 'senha_redefinida', jsonb_build_object('via', 'email_reset', 'ts', now()));

  RETURN jsonb_build_object('success', true, 'message', 'Senha redefinida com sucesso');
END;
$$;

REVOKE ALL ON FUNCTION public.reset_password_by_email(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_password_by_email(TEXT, TEXT) TO authenticated;

-- Tabela legada não é usada pelo fluxo Auth e não deve expor tokens ao navegador.
DROP POLICY IF EXISTS "Anyone can view reset tokens" ON public.password_reset_tokens;
DROP POLICY IF EXISTS "Anyone can insert reset tokens" ON public.password_reset_tokens;
DROP POLICY IF EXISTS "Anyone can update reset tokens" ON public.password_reset_tokens;
REVOKE ALL ON TABLE public.password_reset_tokens FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_tokens() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_tokens() TO service_role;

COMMIT;
