-- LOCAL PostgreSQL ONLY; test real full production function definition
-- with dummy auth.uid() and profiles. No production writes or business data.
DO $test$
DECLARE
  definition text;
BEGIN
 SELECT pg_get_functiondef('public.commit_master_database(jsonb)'::regprocedure)
 INTO definition;
 IF position('must_change_password is false' IN definition)=0
 THEN RAISE EXCEPTION 'Master commit missing rotation guard'; END IF;
 IF position('SECURITY DEFINER' IN definition)=0
 THEN RAISE EXCEPTION 'Expected to check original SECURITY DEFINER semantics'; END IF;
END $test$;

-- A signed-in EC must be denied before ANY master-data access.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
DO $test$
BEGIN
  BEGIN
    PERFORM public.commit_master_database('{}'::jsonb);
    RAISE EXCEPTION 'EC unexpectedly allowed to call master commit';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Akses ditolak:%'
    THEN RAISE; END IF;
  END;
END $test$;
RESET ROLE;

-- A still-active Admin with mandatory rotation must be denied.
UPDATE public.profiles
 SET must_change_password=true
 WHERE id='11111111-1111-1111-1111-111111111111';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
DO $test$
BEGIN
  BEGIN
    PERFORM public.commit_master_database('{}'::jsonb);
    RAISE EXCEPTION 'Unrotated Admin unexpectedly allowed to call master commit';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Akses ditolak:%'
    THEN RAISE; END IF;
  END;
END $test$;
RESET ROLE;

-- Completed rotation restores correct authorization (invalid payload
-- reaches the next guard rather than the Admin access denial).
UPDATE public.profiles
 SET must_change_password=false
 WHERE id='11111111-1111-1111-1111-111111111111';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
DO $test$
BEGIN
  BEGIN
    PERFORM public.commit_master_database('{}'::jsonb);
    RAISE EXCEPTION 'Unexpected successful empty import';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Periode target belum dipilih%'
    THEN RAISE; END IF;
  END;
END $test$;
RESET ROLE;
SELECT 'PASS: production-body SECURITY DEFINER RPC gate' AS outcome;
