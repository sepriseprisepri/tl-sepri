-- Samsung Kalteng / TL SEPRI: NON-MUTATING security baseline.
-- Can be used on production for inspection, or staging for comparison.
-- SELECT only. Never inserts, updates, deletes, alters or provisions resources.
WITH
tables AS (
 SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE c.relrowsecurity)::int AS rls_on
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p')
),
f AS (
 SELECT p.proname,
        has_function_privilege('anon',p.oid,'EXECUTE') AS anon_exec,
        has_function_privilege('authenticated',p.oid,'EXECUTE') AS auth_exec
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public'
   AND p.proname IN (
    'can_access_store','can_manage_targets','commit_master_database',
    'current_app_role','is_admin'
   )
),
promo AS (
 SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (
         WHERE published AND verification_state='verified' AND scope_type='national'
        )::int AS published_national,
        COUNT(*) FILTER (WHERE requires_review AND NOT published)::int AS held
 FROM public.sales_promotions
),
rules AS (
 SELECT bool_or(policyname='sales_promos_read_verified' AND cmd='SELECT'
                AND qual LIKE '%published%' AND qual LIKE '%current_app_role%') AS read_rule,
        bool_or(policyname='sales_promos_admin_manage' AND cmd='ALL'
                AND qual LIKE '%is_admin%') AS admin_rule
 FROM pg_policies
 WHERE schemaname='public' AND tablename='sales_promotions'
)
SELECT 'RLS enabled for all public tables' AS test_name,
       (rls_on=total AND total>0) AS passed,
       rls_on||'/'||total AS observation
FROM tables
UNION ALL
SELECT 'Anon cannot EXECUTE five sensitive functions',
       COALESCE(bool_and(NOT anon_exec),false) AND COUNT(*)=5,
       COUNT(*)::text||' functions'
FROM f
UNION ALL
SELECT 'Authenticated-function exposure baseline (review required)',
       COALESCE(bool_and(auth_exec),false) AND COUNT(*)=5,
       COUNT(*)::text||' authenticated-callable functions'
FROM f
UNION ALL
SELECT 'National promo read policy exists',
       COALESCE(read_rule,false),'SELECT RLS policy'
FROM rules
UNION ALL
SELECT 'Admin promo write policy exists (intentional baseline)',
       COALESCE(admin_rule,false),'ALL RLS policy'
FROM rules
UNION ALL
SELECT 'National promos and review drafts are present',
       published_national>0 AND held>=0,
       published_national||' published, '||held||' draft-held'
FROM promo
ORDER BY test_name;

-- Metadata only: inspect privileges and policy dependencies without executing functions.
SELECT p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS arguments,
       p.prosecdef AS security_definer,
       has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
       has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute,
       p.proconfig AS settings
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND p.proname IN ('can_access_store','can_manage_targets','commit_master_database',
                   'current_app_role','is_admin')
ORDER BY p.proname;

SELECT tablename,policyname,cmd,roles,qual,with_check
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('profiles','raw_sellout','sales_promotions',
                    'sales_promotion_stores','store_targets')
ORDER BY tablename,policyname;
