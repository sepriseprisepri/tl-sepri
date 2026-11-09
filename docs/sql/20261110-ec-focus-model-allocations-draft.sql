-- STAGING-FIRST: requires Supabase review and approval before application to production.
-- EC focus allocations; do not infer personal targets from focus_model_targets (store totals).
BEGIN;
CREATE TABLE public.ec_focus_model_allocations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 period_id uuid NOT NULL REFERENCES public.target_periods(id),
 store_id uuid NOT NULL REFERENCES public.stores(id),
 ec_profile_id uuid NOT NULL REFERENCES public.profiles(id),
 model_code text NOT NULL REFERENCES public.focus_model_settings(model_code),
 target_qty numeric(12,3) NOT NULL CHECK (target_qty>=0),
 target_amt numeric(18,2) NOT NULL CHECK (target_amt>=0),
 allocated_by uuid NOT NULL REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT ec_focus_alloc_unique UNIQUE(period_id,store_id,ec_profile_id,model_code)
);
CREATE INDEX ec_focus_alloc_ec_period ON public.ec_focus_model_allocations(ec_profile_id,period_id);
CREATE INDEX ec_focus_alloc_store_period ON public.ec_focus_model_allocations(store_id,period_id);
ALTER TABLE public.ec_focus_model_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ec_focus_model_allocations FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.ec_focus_model_allocations TO authenticated;
GRANT ALL ON public.ec_focus_model_allocations TO service_role;
CREATE POLICY ec_focus_personal_read ON public.ec_focus_model_allocations
 FOR SELECT TO authenticated USING (
  ec_profile_id=(SELECT auth.uid()) AND (SELECT public.current_app_role())='ec'
 );
CREATE POLICY ec_focus_management_read ON public.ec_focus_model_allocations
 FOR SELECT TO authenticated USING (
  (SELECT public.current_app_role())='admin'
  OR ((SELECT public.current_app_role())='tl' AND public.can_access_store(store_id))
 );
-- Only active TL in coverage or Admin can allocate. Recipient must be an active
-- EC assigned to the chosen store. This check is performed server-side (RLS).
CREATE OR REPLACE FUNCTION public.ec_focus_can_allocate(
 p_store_id uuid,p_ec_id uuid,p_period_id uuid
) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
 AS $$
 SELECT EXISTS(
   SELECT 1 FROM public.profiles actor
   JOIN public.profiles recipient ON recipient.id=p_ec_id
   JOIN public.manpower m ON m.id=recipient.manpower_id
   JOIN public.store_assignments a ON a.manpower_id=m.id
   JOIN public.target_periods tp ON tp.id=p_period_id
   WHERE actor.id=(SELECT auth.uid())
    AND actor.is_active AND NOT actor.must_change_password
    AND actor.role IN ('admin','tl')
    AND (actor.role='admin' OR public.can_access_store(p_store_id))
    AND recipient.role='ec' AND recipient.is_active
    AND NOT recipient.must_change_password
    AND m.is_active AND m.fieldforce_position='EC'
    AND a.store_id=p_store_id
    AND tp.period_start<=COALESCE(a.valid_to,'infinity'::date)
    AND tp.period_end>=a.valid_from
 );
 $$;
REVOKE ALL ON FUNCTION public.ec_focus_can_allocate(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ec_focus_can_allocate(uuid,uuid,uuid) TO authenticated,service_role;
CREATE POLICY ec_focus_insert ON public.ec_focus_model_allocations
 FOR INSERT TO authenticated WITH CHECK (
  allocated_by=(SELECT auth.uid()) AND public.ec_focus_can_allocate(store_id,ec_profile_id,period_id)
 );
CREATE POLICY ec_focus_update ON public.ec_focus_model_allocations
 FOR UPDATE TO authenticated USING (
  public.ec_focus_can_allocate(store_id,ec_profile_id,period_id)
 ) WITH CHECK (
  public.ec_focus_can_allocate(store_id,ec_profile_id,period_id)
 );
CREATE POLICY ec_focus_delete ON public.ec_focus_model_allocations
 FOR DELETE TO authenticated USING (
  public.ec_focus_can_allocate(store_id,ec_profile_id,period_id)
 );
COMMIT;
-- Before activation: test TL in/out of coverage, EC own vs other EC, admin,
-- inactive/unassigned EC; confirm all sums and per-model allocations match.
-- IMPORTANT: provisioning UI for TL allocations will be activated separately.
