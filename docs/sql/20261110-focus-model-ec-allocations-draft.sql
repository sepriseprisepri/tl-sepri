-- DRAFT / STAGING ONLY. No production migration without approval.
-- Personal Focus Model allocations are separate from store-level focus_model_targets.
BEGIN;
CREATE TABLE IF NOT EXISTS public.focus_model_ec_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.target_periods(id),
  manpower_id uuid NOT NULL REFERENCES public.manpower(id),
  store_id uuid NOT NULL REFERENCES public.stores(id),
  model_code text NOT NULL REFERENCES public.focus_model_settings(model_code),
  target_qty numeric(14,3) NOT NULL DEFAULT 0 CHECK(target_qty>=0),
  target_amt numeric(18,2) NOT NULL DEFAULT 0 CHECK(target_amt>=0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id),
  UNIQUE(period_id,manpower_id,store_id,model_code)
);
CREATE INDEX IF NOT EXISTS focus_ec_targets_lookup
 ON public.focus_model_ec_targets(period_id,manpower_id,store_id);
ALTER TABLE public.focus_model_ec_targets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.focus_model_ec_targets FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.focus_model_ec_targets TO authenticated;
GRANT INSERT(period_id,manpower_id,store_id,model_code,target_qty,target_amt,updated_by),
      UPDATE(target_qty,target_amt,updated_by), DELETE
 ON public.focus_model_ec_targets TO authenticated;
-- EC reads only own allocations. Authorization is database-enforced, never browser-only.
CREATE POLICY focus_ec_read_own ON public.focus_model_ec_targets FOR SELECT TO authenticated
 USING (
  (SELECT public.current_app_role())='ec'
  AND manpower_id=(SELECT p.manpower_id FROM public.profiles p WHERE p.id=(SELECT auth.uid()))
 );
CREATE POLICY focus_tl_read_scope ON public.focus_model_ec_targets FOR SELECT TO authenticated
 USING (
  (SELECT public.current_app_role()) IN ('tl','tso','admin')
  AND public.can_access_store(store_id)
 );
-- TL assigns goals only to active EC currently assigned to the store in TL's own scope.
CREATE POLICY focus_tl_insert_scope ON public.focus_model_ec_targets FOR INSERT TO authenticated
 WITH CHECK (
  (SELECT public.current_app_role()) IN ('tl','admin')
  AND updated_by=(SELECT auth.uid())
  AND public.can_access_store(store_id)
  AND EXISTS (
   SELECT 1 FROM public.manpower m
   JOIN public.store_assignments sa ON sa.manpower_id=m.id
   JOIN public.target_periods p ON p.id=period_id
   WHERE m.id=manpower_id AND m.is_active AND m.fieldforce_position='EC'
     AND sa.store_id=focus_model_ec_targets.store_id
     AND sa.valid_from<=p.period_end
     AND COALESCE(sa.valid_to,'infinity'::date)>=p.period_start
  )
 );
CREATE POLICY focus_tl_update_scope ON public.focus_model_ec_targets FOR UPDATE TO authenticated
 USING ((SELECT public.current_app_role()) IN ('tl','admin') AND public.can_access_store(store_id))
 WITH CHECK (
  (SELECT public.current_app_role()) IN ('tl','admin')
  AND updated_by=(SELECT auth.uid())
  AND public.can_access_store(store_id)
 );
CREATE POLICY focus_tl_delete_scope ON public.focus_model_ec_targets FOR DELETE TO authenticated
 USING ((SELECT public.current_app_role()) IN ('tl','admin') AND public.can_access_store(store_id));
COMMIT;
-- Verify referenced table target_periods and FK types against actual staging schema before execution.
-- Staging tests: EC1 only sees own model targets; EC2 cannot read EC1; TL sees sum per scope.
-- TL cannot assign out-of-scope stores or inactive / unassigned EC.
-- Compare sum of EC allocations vs store-level targets, flag discrepancies.
-- Rollback: DROP TABLE public.focus_model_ec_targets (only after export/backup).
