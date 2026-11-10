-- STAGING / CI ONLY. Never apply to production without separate approval.
-- No plaintext passwords, tokens, or password hashes are persisted here.
BEGIN;

CREATE TABLE IF NOT EXISTS public.password_recovery_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  employee_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('ec','tl','tso')),
  reason text NOT NULL CHECK (reason IN ('forgot','reset')),
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending','processing','awaiting_delivery','delivered','completed','rejected','failed','expired')
  ),
  requester_fingerprint text NOT NULL CHECK (requester_fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users(id),
  expires_at timestamptz,
  delivered_at timestamptz,
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_password_recovery_user_created
 ON public.password_recovery_requests(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_password_recovery_ip_created
 ON public.password_recovery_requests(requester_fingerprint,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_password_recovery_one_open_request
 ON public.password_recovery_requests(user_id)
 WHERE status IN ('pending','processing','awaiting_delivery','delivered');

ALTER TABLE public.password_recovery_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_recovery_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.password_recovery_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON TABLE public.password_recovery_requests TO service_role;

CREATE TABLE IF NOT EXISTS public.password_recovery_rate_buckets (
  requester_fingerprint text NOT NULL CHECK (requester_fingerprint ~ '^[0-9a-f]{64}$'),
  bucket_started_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  PRIMARY KEY (requester_fingerprint,bucket_started_at)
);
ALTER TABLE public.password_recovery_rate_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_recovery_rate_buckets FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.password_recovery_rate_buckets FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON TABLE public.password_recovery_rate_buckets TO service_role;

-- Atomic counter: INSERT..ON CONFLICT serializes concurrent claims for one bucket.
-- May only be invoked by the service_role backend, never by the browser.
CREATE OR REPLACE FUNCTION public.password_recovery_claim_rate(p_fingerprint text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog,pg_temp
AS $function$
DECLARE
  v_bucket timestamptz;
  v_attempts integer;
BEGIN
  IF p_fingerprint IS NULL OR p_fingerprint !~ '^[0-9a-f]{64}$' THEN
    RETURN false;
  END IF;
  v_bucket := date_trunc('hour',clock_timestamp());
  INSERT INTO public.password_recovery_rate_buckets AS b
    (requester_fingerprint,bucket_started_at,attempts)
  VALUES (p_fingerprint,v_bucket,1)
  ON CONFLICT (requester_fingerprint,bucket_started_at)
  DO UPDATE SET attempts=b.attempts+1 WHERE b.attempts<5
  RETURNING attempts INTO v_attempts;
  RETURN v_attempts IS NOT NULL AND v_attempts<=5;
END
$function$;

REVOKE ALL ON FUNCTION public.password_recovery_claim_rate(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.password_recovery_claim_rate(text) TO service_role;
COMMIT;

-- Verification gates:
-- 1. Run exclusively in isolated Postgres / Supabase local with dummy auth.users.
-- 2. Confirm anon/authenticated cannot read request or counter tables, nor execute RPC.
-- 3. Confirm service_role can call RPC exactly five times/bucket and sixth is denied.
-- 4. Confirm concurrent calls cannot exceed five, verify with real Postgres.
-- 5. Confirm service_role BYPASSRLS and execution owner permissions in deployment.
-- 6. Require trusted ingress, server-side CAPTCHA, rate-limit bypass protection.
-- 7. Review data retention and production migration separately.
