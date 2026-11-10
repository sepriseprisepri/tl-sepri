-- DRAFT ONLY — DO NOT APPLY TO PRODUCTION WITHOUT SEPARATE APPROVAL.
-- Admin-approved password recovery with no plaintext secrets stored in Postgres.
-- Requires verified Edge Function and RLS validation before deploy.
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
  requester_fingerprint text NOT NULL CHECK (length(requester_fingerprint)=64),
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users(id),
  expires_at timestamptz,
  delivered_at timestamptz,
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_password_recovery_user_created
 ON public.password_recovery_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_password_recovery_ip_created
 ON public.password_recovery_requests(requester_fingerprint, created_at DESC);
-- One nonterminal request per user. The Edge Function handles duplicate errors generically.
CREATE UNIQUE INDEX IF NOT EXISTS idx_password_recovery_one_open_request
 ON public.password_recovery_requests(user_id)
 WHERE status IN ('pending','processing','awaiting_delivery','delivered');
ALTER TABLE public.password_recovery_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_recovery_requests FORCE ROW LEVEL SECURITY;
-- Client roles have no SQL access; only the server-side service_role may use this table.
REVOKE ALL ON TABLE public.password_recovery_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.password_recovery_requests TO service_role;
COMMIT;

-- OPEN DESIGN GATES BEFORE PRODUCTION:
-- 1. Verify current business RLS excludes profiles.is_active=false and/or
--    must_change_password=true for ALL tables/functions; deny on refresh and stale JWT.
-- 2. Backend MUST verify approved requests and 24h expiry; Auth password itself is
--    not automatically revoked at expiry, so expired recovery session remains blocked.
-- 3. Add trusted ingress + CAPTCHA and atomic request rate limiting before enabling
--    an anonymous endpoint; per-IP query limits alone are not sufficient.
-- 4. Review privacy, retention and automated expiry cleanup of request records.
-- 5. Test failure after disable/Auth update/state update and admin retry recovery.
-- 6. Remove FORCE RLS if necessary for service_role? service_role has bypassrls, verify.
