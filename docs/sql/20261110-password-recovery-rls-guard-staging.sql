-- STAGING / LOCAL ONLY. Do not run on production without security review.
-- Ensure no authenticated role (including active legacy sessions) can acquire business
-- role privileges while a profile requires a mandatory password rotation.
BEGIN;
CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
 SELECT p.role FROM public.profiles AS p
 WHERE p.id = (SELECT auth.uid())
   AND p.is_active IS TRUE
   AND p.must_change_password IS FALSE
$$;
-- Existing owner and EXECUTE privileges must be reviewed using pg_proc/acl.
-- No automatic GRANT added. Existing can_access_store() and is_admin() depend on
-- current_app_role(), so must be verified for both EC and TL in local RLS tests.
COMMIT;

-- Local verification (do NOT run on production):
-- 1. Use dedicated dummy authenticated JWTs: active TL/EC, recovery TL/EC,
--    and Admin; never use actual production account IDs.
-- 2. Recovery role must evaluate NULL for current_app_role() and FALSE for is_admin().
-- 3. Directly call SELECT on stores, store_targets, target_periods,
--    raw_sellout, focus_model_targets, manpower, coverage_assignments,
--    and call all exposed RPCs; sensitive data must be hidden.
-- 4. Profiles self SELECT remains allowed intentionally so login can detect
--    mandatory rotation. Verify no profile mutation can bypass the flag.
-- 5. After authorized recovery, role should return original role.
-- 6. Rollback: restore the exact pre-change function definition saved from
--    staging pg_get_functiondef() (no hard-coded rollback from unknown state).
