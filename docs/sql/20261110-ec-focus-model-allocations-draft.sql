-- DRAFT ONLY: EC-specific Focus Model allocation by TL.
-- Requires staging RLS test and user approval before production activation.
BEGIN;
CREATE TABLE public.focus_model_ec_targets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 period_id uuid NOT NULL REFERENCES public.target_periods(id),
 store_id uuid NOT NULL REFERENCES public.stores(id),
 manpower_id uuid NOT NULL REFERENCES public.manpower(id),
 model_code text NOT NULL REFERENCES public.focus_model_settings(model_code),
 target_qty numeric NOT NULL CHECK(target_qty>=0),
 target_amt numeric NOT NULL CHECK(target_amt>=0),
 assigned_by uuid NOT NULL REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(period_id,store_id,manpower_id,model_code)
);
CREATE INDEX focus_model_ec_scope_idx ON public.focus_model_ec_targets(manpower_id,period_id);
CREATE INDEX focus_model_ec_store_idx ON public.focus_model_ec_targets(store_id,period_id);
ALTER TABLE public.focus_model_ec_targets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.focus_model_ec_targets FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.focus_model_ec_targets TO authenticated;
GRANT ALL ON public.focus_model_ec_targets TO service_role;
CREATE POLICY focus_ec_read_self ON public.focus_model_ec_targets FOR SELECT TO authenticated USING (
 (SELECT public.current_app_role())='ec'
 AND EXISTS (SELECT 1 FROM public.profiles p
   WHERE p.id=(SELECT auth.uid()) AND p.manpower_id=focus_model_ec_targets.manpower_id
   AND p.is_active AND NOT p.must_change_password)
);
CREATE POLICY focus_tl_read ON public.focus_model_ec_targets FOR SELECT TO authenticated USING (
 (SELECT public.current_app_role())='admin'
 OR ((SELECT public.current_app_role())='tl' AND public.can_access_store(store_id))
);
-- TL can allocate only active EC manpower actually assigned to their covered store;
-- both the existing row and the replacement row must pass the same checks.
CREATE OR REPLACE FUNCTION public.focus_tl_valid_assignment(p_store uuid,p_manpower uuid,p_period uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT (SELECT public.current_app_role())='tl'
  AND public.can_access_store(p_store)
  AND EXISTS (
    SELECT 1 FROM public.manpower m
    JOIN public.store_assignments sa ON sa.manpower_id=m.id
    JOIN public.target_periods tp ON tp.id=p_period
    WHERE m.id=p_manpower AND m.fieldforce_position='EC' AND m.is_active
      AND sa.store_id=p_store
      AND sa.valid_from<=tp.period_end
      AND COALESCE(sa.valid_to,'infinity'::date)>=tp.period_start
  )
$$;
REVOKE ALL ON FUNCTION public.focus_tl_valid_assignment(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.focus_tl_valid_assignment(uuid,uuid,uuid) TO authenticated,service_role;
CREATE POLICY focus_tl_insert ON public.focus_model_ec_targets FOR INSERT TO authenticated WITH CHECK (
 assigned_by=(SELECT auth.uid()) AND public.focus_tl_valid_assignment(store_id,manpower_id,period_id)
);
CREATE POLICY focus_tl_update ON public.focus_model_ec_targets FOR UPDATE TO authenticated
 USING(public.focus_tl_valid_assignment(store_id,manpower_id,period_id))
 WITH CHECK(public.focus_tl_valid_assignment(store_id,manpower_id,period_id) AND assigned_by=(SELECT auth.uid()));
CREATE POLICY focus_tl_delete ON public.focus_model_ec_targets FOR DELETE TO authenticated
 USING(public.focus_tl_valid_assignment(store_id,manpower_id,period_id));
-- Hardening required: protect identity columns through column grants/immutable trigger,
-- prevent overlapping EC allocations and maintain change audit before activation.
COMMIT;
