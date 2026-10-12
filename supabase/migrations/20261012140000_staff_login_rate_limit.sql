-- Service-only throttling for the staff-login Edge Function. No account lookup
-- occurs here, so existing and nonexistent usernames have identical behavior.
-- Counters contain SHA-256 fingerprints, never usernames or client IP plaintext.
BEGIN;
CREATE TABLE IF NOT EXISTS public.staff_login_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_fingerprint text NOT NULL,
  ip_fingerprint text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);
CREATE INDEX IF NOT EXISTS staff_login_attempts_account_time ON public.staff_login_attempts(account_fingerprint, attempted_at);
CREATE INDEX IF NOT EXISTS staff_login_attempts_ip_time ON public.staff_login_attempts(ip_fingerprint, attempted_at);
ALTER TABLE public.staff_login_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.staff_login_attempts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.staff_login_attempts_id_seq FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.staff_login_attempts TO service_role;
GRANT USAGE ON SEQUENCE public.staff_login_attempts_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.consume_staff_login_attempt(p_username text, p_client_ip text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_username text;
  v_ip text;
  v_account_fingerprint text;
  v_ip_fingerprint text;
  v_account_lock bigint;
  v_ip_lock bigint;
  v_now timestamptz;
BEGIN
  -- Bound raw input before normalization/hashing. The Edge Function must obtain
  -- client IP from a trusted platform header, never the JSON request body.
  IF p_username IS NULL OR pg_catalog.length(p_username) > 64 OR
     p_client_ip IS NULL OR pg_catalog.length(p_client_ip) > 128 THEN RETURN false; END IF;
  v_username := pg_catalog.lower(pg_catalog.btrim(p_username));
  IF v_username !~ '^[a-z0-9_-]{3,64}$' THEN RETURN false; END IF;
  BEGIN
    v_ip := pg_catalog.host(pg_catalog.btrim(p_client_ip)::inet);
  EXCEPTION WHEN invalid_text_representation THEN RETURN false; END;
  IF v_ip IS NULL THEN RETURN false; END IF;
  v_account_fingerprint := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_username,'UTF8')),'hex');
  v_ip_fingerprint := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_ip,'UTF8')),'hex');
  v_account_lock := pg_catalog.hashtextextended('staff-login-account:' || v_account_fingerprint, 0);
  v_ip_lock := pg_catalog.hashtextextended('staff-login-ip:' || v_ip_fingerprint, 0);
  -- Globally ordered locks serialize both limits without account/IP deadlocks.
  PERFORM pg_catalog.pg_advisory_xact_lock(LEAST(v_account_lock,v_ip_lock));
  PERFORM pg_catalog.pg_advisory_xact_lock(GREATEST(v_account_lock,v_ip_lock));
  -- Avoid stale snapshots weakening limits when called in an unusual isolation.
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN RETURN false; END IF;
  v_now := pg_catalog.clock_timestamp();
  IF (SELECT pg_catalog.count(*) FROM public.staff_login_attempts a WHERE a.account_fingerprint=v_account_fingerprint AND a.attempted_at > v_now-INTERVAL '15 minutes') >= 5 OR
     (SELECT pg_catalog.count(*) FROM public.staff_login_attempts a WHERE a.ip_fingerprint=v_ip_fingerprint AND a.attempted_at > v_now-INTERVAL '1 minute') >= 20 THEN
    RETURN false;
  END IF;
  INSERT INTO public.staff_login_attempts(account_fingerprint,ip_fingerprint,attempted_at)
    VALUES(v_account_fingerprint,v_ip_fingerprint,v_now);
  -- Retain a short operational window; this never touches accounts or children.
  DELETE FROM public.staff_login_attempts WHERE attempted_at < v_now-INTERVAL '1 hour';
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.consume_staff_login_attempt(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_staff_login_attempt(text,text) TO service_role;
COMMIT;
