-- Samsung Kalteng: production-safe read-only security regression checks.
-- Queries only pg_catalog / pg_policies metadata, no accounts or business rows.
-- Run on staging and optionally production; interpret false results as a STOP sign.
-- This is NOT a substitute for JWT-authenticated end-to-end RLS tests.

WITH checks AS (
 SELECT 'public_tables_rls_enabled' AS check_id,
        (SELECT COUNT(*)>0 AND BOOL_AND(c.relrowsecurity)
         FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND c.relkind IN ('r','p')) AS passed,
        'Every public table has row-level security enabled' AS rationale
 UNION ALL
 SELECT 'public_profiles_self_update_guard',
        EXISTS (
         SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles'
          AND policyname='profiles_update_self_limited' AND cmd='UPDATE'
          AND qual LIKE '%auth.uid%'
          AND with_check LIKE '%current_app_role%'
          AND with_check LIKE '%employee_id%'
          AND with_check LIKE '%manpower_id%'
          AND with_check LIKE '%is_active%'
          AND with_check LIKE '%must_change_password%'
        ),
        'Self-update policy still guards role and sensitive account fields'
 UNION ALL
 SELECT 'promo_read_is_published_verified',
        EXISTS (
         SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sales_promotions'
          AND policyname='sales_promos_read_verified' AND cmd='SELECT'
          AND qual LIKE '%published%'
          AND qual LIKE '%verification_state%'
          AND qual LIKE '%verified_at%'
          AND qual LIKE '%current_app_role%'
          AND qual LIKE '%scope_type%'
        ),
        'Promo SELECT still restricts by publication, verification, role, and scope'
 UNION ALL
 SELECT 'promo_write_is_admin',
        EXISTS (
         SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sales_promotions'
          AND policyname='sales_promos_admin_manage' AND cmd='ALL'
          AND qual LIKE '%is_admin%'
          AND with_check LIKE '%is_admin%'
        ),
        'Promo write policy still checks current Admin authorization'
 UNION ALL
 SELECT 'master_commit_definer_not_anonymous',
        EXISTS (
         SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.proname='commit_master_database'
          AND pg_get_function_identity_arguments(p.oid)='p_payload jsonb'
          AND p.prosecdef AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
        ),
        'Master import RPC remains unavailable to anonymous role'
 UNION ALL
 SELECT 'privileged_functions_not_anonymous',
        (SELECT COUNT(*)=5 AND BOOL_AND(NOT has_function_privilege('anon',p.oid,'EXECUTE'))
         FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public'
          AND p.proname IN ('can_access_store','can_manage_targets',
                            'commit_master_database','current_app_role','is_admin')),
        'All five privileged functions deny EXECUTE to anon'
 UNION ALL
 SELECT 'helper_functions_fixed_search_path',
        (SELECT COUNT(*)=5 AND BOOL_AND(p.proconfig IS NOT NULL
          AND EXISTS(SELECT 1 FROM unnest(p.proconfig) AS config WHERE config LIKE 'search_path=%'))
         FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public'
          AND p.proname IN ('can_access_store','can_manage_targets',
                            'commit_master_database','current_app_role','is_admin')),
        'All five SECURITY DEFINER functions retain explicit search_path'
)
SELECT check_id, COALESCE(passed,false) AS passed, rationale
FROM checks ORDER BY check_id;

-- This check intentionally does NOT assert zero security advisories.
-- Five authenticated-callable SECURITY DEFINER RPCs and disabled leaked-password
-- protection remain documented risks requiring separate remediation.
