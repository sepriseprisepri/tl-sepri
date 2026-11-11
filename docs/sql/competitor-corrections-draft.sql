-- DRAFT: do not apply before isolated integration and concurrency tests.
-- EC may correct only their own entry created today (WIB), with a current
-- assignment to its original store. The original store/date cannot be changed.
BEGIN;

CREATE TABLE public.competitor_correction_history (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 competitor_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES public.profiles(id),
 store_id uuid NOT NULL REFERENCES public.stores(id),
 action text NOT NULL CHECK (action IN ('update','delete')),
 before_data jsonb NOT NULL,
 after_data jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.competitor_correction_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.competitor_correction_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.competitor_correction_history TO authenticated;
CREATE POLICY competitor_history_read ON public.competitor_correction_history
 FOR SELECT TO authenticated USING (
   ((SELECT public.current_app_role())='ec' AND actor_id=(SELECT auth.uid()))
   OR ((SELECT public.current_app_role()) IN ('admin','tl','tso')
       AND public.can_access_store(store_id))
 );
CREATE POLICY competitor_history_rotation_gate ON public.competitor_correction_history
 AS RESTRICTIVE FOR ALL TO authenticated
 USING ((SELECT public.current_app_role()) IS NOT NULL)
 WITH CHECK ((SELECT public.current_app_role()) IS NOT NULL);

-- Audit is transactionally coupled to the change. Clients cannot write history.
CREATE FUNCTION public.audit_competitor_correction() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
 INSERT INTO public.competitor_correction_history
   (competitor_id,actor_id,store_id,action,before_data,after_data)
 VALUES (OLD.id, auth.uid(), OLD.store_id, lower(TG_OP), to_jsonb(OLD),
         CASE WHEN TG_OP='UPDATE' THEN to_jsonb(NEW) ELSE NULL END);
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.audit_competitor_correction() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER competitor_correction_audit AFTER UPDATE OR DELETE
 ON public.competitor_sellout FOR EACH ROW EXECUTE FUNCTION public.audit_competitor_correction();

-- Explicit column grants prevent changing ownership, timestamp, store or date.
GRANT UPDATE (brand,model,variant,qty,unit_price,notes), DELETE
 ON public.competitor_sellout TO authenticated;
CREATE POLICY competitor_ec_update_today ON public.competitor_sellout
 FOR UPDATE TO authenticated
 USING (
   ec_profile_id=(SELECT auth.uid())
   AND (SELECT public.current_app_role())='ec'
   AND (created_at AT TIME ZONE 'Asia/Pontianak')::date=(now() AT TIME ZONE 'Asia/Pontianak')::date
   AND EXISTS (SELECT 1 FROM public.profiles p
     JOIN public.manpower m ON m.id=p.manpower_id
     JOIN public.store_assignments sa ON sa.manpower_id=m.id
     WHERE p.id=(SELECT auth.uid()) AND p.is_active AND p.role='ec'
       AND m.is_active AND m.fieldforce_position='EC'
       AND sa.store_id=competitor_sellout.store_id
       AND (now() AT TIME ZONE 'Asia/Pontianak')::date BETWEEN sa.valid_from AND coalesce(sa.valid_to,'infinity'::date))
 )
 WITH CHECK (ec_profile_id=(SELECT auth.uid()) AND (SELECT public.current_app_role())='ec');
CREATE POLICY competitor_ec_delete_today ON public.competitor_sellout
 FOR DELETE TO authenticated
 USING (
   ec_profile_id=(SELECT auth.uid())
   AND (SELECT public.current_app_role())='ec'
   AND (created_at AT TIME ZONE 'Asia/Pontianak')::date=(now() AT TIME ZONE 'Asia/Pontianak')::date
   AND EXISTS (SELECT 1 FROM public.profiles p
     JOIN public.manpower m ON m.id=p.manpower_id
     JOIN public.store_assignments sa ON sa.manpower_id=m.id
     WHERE p.id=(SELECT auth.uid()) AND p.is_active AND p.role='ec'
       AND m.is_active AND m.fieldforce_position='EC'
       AND sa.store_id=competitor_sellout.store_id
       AND (now() AT TIME ZONE 'Asia/Pontianak')::date BETWEEN sa.valid_from AND coalesce(sa.valid_to,'infinity'::date))
 );
COMMIT;
