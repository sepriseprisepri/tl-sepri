-- STAGING / REVIEW ONLY: mandatory recovery gate for 19 business tables.
-- No production SQL changes without explicit approval.
-- Restrictive RLS is AND-composed with existing permissive policies.
-- Profiles is intentionally excluded so the user can read own recovery flags.
-- Requires public.current_app_role() staging guard to be applied first.
BEGIN;
DO $guard$
DECLARE
  t text;
  tables text[] := ARRAY[
    'affordability_surveys','audit_logs','competitor_sellout',
    'coverage_assignments','ec_target_allocations','focus_model_settings',
    'focus_model_targets','import_history','manpower','raw_sellout',
    'sales_promotion_stores','sales_promotions','store_assignments',
    'store_shadow_history','store_targets','stores','target_periods',
    'user_saved_filters','user_ui_preferences'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- The isolated fixture has a subset of the 19 production tables.
    -- Production review MUST assert exact table parity before applying.
    IF to_regclass(format('public.%I',t)) IS NULL THEN
      RAISE NOTICE 'Staging fixture missing %, no rule installed',t;
      CONTINUE;
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS password_recovery_mandatory_rotation_gate ON public.%I',t);
    EXECUTE format(
      'CREATE POLICY password_recovery_mandatory_rotation_gate
       ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
       USING ((SELECT public.current_app_role()) IS NOT NULL)
       WITH CHECK ((SELECT public.current_app_role()) IS NOT NULL)',t
    );
  END LOOP;
END
$guard$;
-- Existing profiles_select_self_or_admin remains readable so login routing
-- can detect must_change_password without exposing business information.
DROP POLICY IF EXISTS password_recovery_profiles_write_gate ON public.profiles;
CREATE POLICY password_recovery_profiles_write_gate
  ON public.profiles AS RESTRICTIVE FOR UPDATE TO authenticated
  USING ((SELECT public.current_app_role()) IS NOT NULL)
  WITH CHECK ((SELECT public.current_app_role()) IS NOT NULL);
COMMIT;
-- This does not replace review of SECURITY DEFINER RPCs, storage, server routes.
