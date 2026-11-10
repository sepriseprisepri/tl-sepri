-- DRAFT ONLY. Apply to staging AFTER 20261108-ec-competitor-sellout-draft.sql.
-- NEVER execute against production without explicit approval, backup, and RLS tests.
BEGIN;
CREATE TABLE IF NOT EXISTS public.competitor_sellout_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 competitor_id uuid NOT NULL,
 actor_uid uuid,
 action text NOT NULL CHECK (action IN ('UPDATE','DELETE')),
 before_row jsonb NOT NULL,
 after_row jsonb,
 changed_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.competitor_sellout_audit FROM PUBLIC,anon,authenticated;
ALTER TABLE public.competitor_sellout_audit ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.audit_competitor_sellout_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  INSERT INTO public.competitor_sellout_audit(competitor_id,actor_uid,action,before_row)
  VALUES(OLD.id,auth.uid(),'DELETE',to_jsonb(OLD));
  RETURN OLD;
 END IF;
 INSERT INTO public.competitor_sellout_audit(competitor_id,actor_uid,action,before_row,after_row)
 VALUES(OLD.id,auth.uid(),'UPDATE',to_jsonb(OLD),to_jsonb(NEW));
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.audit_competitor_sellout_change() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS competitor_sellout_audit_trg ON public.competitor_sellout;
CREATE TRIGGER competitor_sellout_audit_trg
AFTER UPDATE OR DELETE ON public.competitor_sellout
FOR EACH ROW EXECUTE FUNCTION public.audit_competitor_sellout_change();
-- The original INSERT policy and SELECT policies remain intact.
GRANT UPDATE (brand,model,variant,qty,unit_price,notes),DELETE
 ON public.competitor_sellout TO authenticated;
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
  AND EXISTS (
   SELECT 1 FROM public.profiles p
   JOIN public.manpower m ON m.id=p.manpower_id
   JOIN public.store_assignments sa ON sa.manpower_id=m.id
   WHERE p.id=(SELECT auth.uid())
     AND p.role='ec' AND p.is_active AND m.is_active
     AND m.fieldforce_position='EC'
     AND sa.store_id=competitor_sellout.store_id
     AND competitor_sellout.sold_at BETWEEN sa.valid_from AND coalesce(sa.valid_to,'infinity'::date)
  )
 );
CREATE POLICY competitor_ec_delete_today ON public.competitor_sellout
 FOR DELETE TO authenticated
 USING (
  ec_profile_id=(SELECT auth.uid())
  AND (SELECT public.current_app_role())='ec'
  AND sold_at=(now() AT TIME ZONE 'Asia/Pontianak')::date
  AND EXISTS (
   SELECT 1 FROM public.profiles p
   JOIN public.manpower m ON m.id=p.manpower_id
   JOIN public.store_assignments sa ON sa.manpower_id=m.id
   WHERE p.id=(SELECT auth.uid()) AND p.role='ec' AND p.is_active
     AND m.is_active AND m.fieldforce_position='EC'
     AND sa.store_id=competitor_sellout.store_id
     AND competitor_sellout.sold_at BETWEEN sa.valid_from AND COALESCE(sa.valid_to,'infinity'::date)
  )
 );
COMMIT;
-- Mandatory staging verification:
-- EC own transaction today UPDATE/DELETE allowed; yesterday and other owner denied.
-- Immutable store_id,ec_profile_id,entry_key,created_at,amount,sold_at cannot be updated.
-- Rows must be audit logged; raw_sellout must remain unchanged.
-- Backup + rollback: DROP POLICIES, REVOKE UPDATE/DELETE, DROP TRIGGER;
-- Verify execute privilege on the SECURITY DEFINER audit trigger function stays revoked
-- from all frontend roles and that the function owner has only the needed privileges.
-- retain audit table for evidence, do not erase audit history.
