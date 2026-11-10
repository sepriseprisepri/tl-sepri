-- ASSERTIONS against isolated PostgreSQL test DB only (not production).
-- Validate metadata and RLS as authenticated/anon impersonations.
DO $test$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='password_recovery_requests') THEN
   RAISE EXCEPTION 'Recovery request table unexpectedly has public policies';
 END IF;
 IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.password_recovery_requests'::regclass) THEN
   RAISE EXCEPTION 'Recovery RLS must be enabled and forced';
 END IF;
 IF has_table_privilege('anon','public.password_recovery_requests','SELECT')
  OR has_table_privilege('authenticated','public.password_recovery_requests','INSERT')
  OR has_table_privilege('authenticated','public.password_recovery_rate_buckets','SELECT')
  OR has_function_privilege('anon','public.password_recovery_claim_rate(text)','EXECUTE')
  OR has_function_privilege('authenticated','public.password_recovery_claim_rate(text)','EXECUTE')
 THEN RAISE EXCEPTION 'Client roles can access password recovery internals'; END IF;
 IF NOT has_function_privilege('service_role','public.password_recovery_claim_rate(text)','EXECUTE')
 THEN RAISE EXCEPTION 'Backend role cannot access rate-claim RPC'; END IF;
END
$test$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
DO $test$
BEGIN
 IF public.current_app_role() IS NOT NULL THEN RAISE EXCEPTION 'Recovery TL must have no business role'; END IF;
 IF public.is_admin() THEN RAISE EXCEPTION 'Recovery TL must not be Admin'; END IF;
 IF (SELECT COUNT(*) FROM public.protected_market_data) <> 0 THEN RAISE EXCEPTION 'Recovery TL sees protected data'; END IF;
 IF (SELECT COUNT(*) FROM public.manpower) <> 0 THEN RAISE EXCEPTION 'Recovery TL sees ownership-only manpower data'; END IF;
END
$test$;
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
DO $test$
BEGIN
 IF public.current_app_role() IS DISTINCT FROM 'ec' THEN RAISE EXCEPTION 'Active EC must retain role'; END IF;
 IF (SELECT COUNT(*) FROM public.protected_market_data) <> 1 THEN RAISE EXCEPTION 'Active EC should see dummy data'; END IF;
 IF (SELECT COUNT(*) FROM public.manpower) <> 1 THEN RAISE EXCEPTION 'Active EC should see own manpower'; END IF;
END
$test$;
RESET ROLE;

-- Simulate an active-but-unrotated TL; gate must still block data.
UPDATE public.profiles SET is_active=true WHERE id='22222222-2222-2222-2222-222222222222';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
DO $test$
BEGIN
 IF public.current_app_role() IS NOT NULL THEN RAISE EXCEPTION 'Unrotated active TL cannot have role'; END IF;
 IF (SELECT COUNT(*) FROM public.protected_market_data) <> 0 THEN RAISE EXCEPTION 'Unrotated active TL sees data'; END IF;
 IF (SELECT COUNT(*) FROM public.manpower) <> 0 THEN RAISE EXCEPTION 'Unrotated TL sees ownership-only manpower'; END IF;
END
$test$;
RESET ROLE;

-- After mandatory rotation completes, TL restores normal business visibility.
UPDATE public.profiles SET must_change_password=false WHERE id='22222222-2222-2222-2222-222222222222';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
DO $test$
BEGIN
 IF public.current_app_role() IS DISTINCT FROM 'tl' THEN RAISE EXCEPTION 'Recovered TL missing business role'; END IF;
 IF (SELECT COUNT(*) FROM public.protected_market_data) <> 1 THEN RAISE EXCEPTION 'Recovered TL missing dummy data'; END IF;
 IF (SELECT COUNT(*) FROM public.manpower) <> 1 THEN RAISE EXCEPTION 'Recovered TL missing own manpower'; END IF;
END
$test$;
RESET ROLE;

-- Rate bucket single-client behavior; sixth request must be rejected atomically.
SET ROLE service_role;
DO $test$
DECLARE i integer; accepted boolean;
BEGIN
 FOR i IN 1..7 LOOP
  SELECT public.password_recovery_claim_rate(repeat('a',64)) INTO accepted;
  IF accepted IS DISTINCT FROM (i<=5) THEN
   RAISE EXCEPTION 'Rate limit assertion failed at request %: %',i,accepted;
  END IF;
 END LOOP;
 IF public.password_recovery_claim_rate('not-hex') THEN RAISE EXCEPTION 'Invalid fingerprint accepted'; END IF;
END
$test$;
RESET ROLE;
SELECT 'PostgreSQL recovery migration, RLS, role guard and rate limit PASS' AS outcome;
