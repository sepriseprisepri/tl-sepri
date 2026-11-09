-- STAGING-FIRST ONLY. Do not enable same-day corrections in production without
-- explicit approval and testing under real EC JWT.
-- UPDATE/DELETE only for the EC who owns the record on local current date.
BEGIN;
GRANT UPDATE(brand,model,variant,qty,unit_price,notes),DELETE ON public.competitor_sellout TO authenticated;
CREATE POLICY competitor_ec_update_today ON public.competitor_sellout
 FOR UPDATE TO authenticated
 USING (
  ec_profile_id=(SELECT auth.uid())
  AND (SELECT public.current_app_role())='ec'
  AND sold_at=(now() AT TIME ZONE 'Asia/Pontianak')::date
 )
 WITH CHECK (
  ec_profile_id=(SELECT auth.uid())
  AND (SELECT public.current_app_role())='ec'
  AND sold_at=(now() AT TIME ZONE 'Asia/Pontianak')::date
 );
CREATE POLICY competitor_ec_delete_today ON public.competitor_sellout
 FOR DELETE TO authenticated USING (
  ec_profile_id=(SELECT auth.uid())
  AND (SELECT public.current_app_role())='ec'
  AND sold_at=(now() AT TIME ZONE 'Asia/Pontianak')::date
 );
-- Audit every changed/deleted row, excluding any RAW Samsung data.
CREATE TABLE public.competitor_sellout_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 operation text NOT NULL CHECK(operation IN ('UPDATE','DELETE')),
 actor_id uuid NOT NULL,
 original_id uuid NOT NULL,
 previous_record jsonb NOT NULL,
 changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.competitor_sellout_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.competitor_sellout_audit FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.competitor_sellout_audit TO authenticated;
CREATE POLICY competitor_audit_own ON public.competitor_sellout_audit
 FOR SELECT TO authenticated USING(actor_id=(SELECT auth.uid()) AND (SELECT public.current_app_role())='ec');
CREATE POLICY competitor_audit_admin ON public.competitor_sellout_audit
 FOR SELECT TO authenticated USING((SELECT public.current_app_role())='admin');
CREATE OR REPLACE FUNCTION public.log_competitor_correction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
BEGIN
 INSERT INTO public.competitor_sellout_audit(operation,actor_id,original_id,previous_record)
 VALUES (TG_OP,(SELECT auth.uid()),OLD.id,to_jsonb(OLD));
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;
REVOKE ALL ON FUNCTION public.log_competitor_correction() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS competitor_correction_audit ON public.competitor_sellout;
CREATE TRIGGER competitor_correction_audit BEFORE UPDATE OR DELETE ON public.competitor_sellout
 FOR EACH ROW EXECUTE FUNCTION public.log_competitor_correction();
COMMIT;
-- Validate: today own update/delete accepted, earlier-day or other EC denied;
-- actor/date cannot change; trigger captures full prior state before delete;
-- no ability to mutate raw_sellout. RLS UPDATE requires own SELECT policy.
