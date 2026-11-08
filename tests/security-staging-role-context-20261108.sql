-- STAGING ONLY: non-mutating role-context smoke tests.
-- Run against a disposable Supabase STAGING project, never production.
-- These checks use SQL SET ROLE to approximate PostgREST's selected database role.
-- SET ROLE alone does NOT prove live JWT signature checks or account claims.
-- Do not add fixture or production user IDs to this file.
--
-- Preconditions:
-- 1. The connected database is a separately verified staging instance.
-- 2. Migrations and synthetic fixtures are installed; production credentials are absent.
-- 3. The operator has permission to SET ROLE anon/authenticated.
--
-- Anonymous role must not see protected records.
BEGIN READ ONLY;
SET LOCAL ROLE anon;
SELECT 'anonymous_has_no_auth_uid' AS scenario,
       auth.uid() IS NULL AS passed;
SELECT 'anonymous_cannot_read_profiles' AS scenario,
       count(*) = 0 AS passed
FROM public.profiles;
SELECT 'anonymous_cannot_read_sellout' AS scenario,
       count(*) = 0 AS passed
FROM public.raw_sellout;
SELECT 'anonymous_cannot_read_targets' AS scenario,
       count(*) = 0 AS passed
FROM public.store_targets;
ROLLBACK;

-- Logged-in database role WITHOUT a signed-in JWT: no app profile, no elevated access.
BEGIN READ ONLY;
SET LOCAL ROLE authenticated;
SELECT 'no_jwt_means_no_auth_uid' AS scenario,
       auth.uid() IS NULL AS passed;
SELECT 'no_jwt_means_no_active_role' AS scenario,
       public.current_app_role() IS NULL AS passed;
SELECT 'no_jwt_is_not_admin' AS scenario,
       NOT public.is_admin() AS passed;
SELECT 'no_jwt_cannot_access_arbitrary_store' AS scenario,
       NOT public.can_access_store('00000000-0000-0000-0000-000000000000'::uuid) AS passed;
SELECT 'no_jwt_cannot_read_profiles' AS scenario,
       count(*) = 0 AS passed
FROM public.profiles;
SELECT 'no_jwt_cannot_read_sellout' AS scenario,
       count(*) = 0 AS passed
FROM public.raw_sellout;
ROLLBACK;

-- Important: Do NOT call commit_master_database() in these baseline checks.
-- It is a mutating SECURITY DEFINER RPC. Test its unauthorized and malformed
-- payload scenarios only on disposable staging with synthetic records and
-- explicit snapshot/rollback verification.
--
-- Follow-up tests with real signed JWTs of synthetic staging accounts:
-- [ ] inactive admin cannot read/write protected objects
-- [ ] EC sees own assigned store and no other store
-- [ ] TL and TSO see only coverage within assignment validity windows
-- [ ] active admin is authorized for intended scope, nothing else
-- [ ] duplicate/invalid master import fails atomically with no partial changes
-- [ ] promo draft remains invisible; published verified national promo visible
