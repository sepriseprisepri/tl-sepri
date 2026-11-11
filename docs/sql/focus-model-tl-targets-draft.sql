-- Draft only: verify in isolated Supabase before production.
BEGIN;
CREATE FUNCTION public.focus_tl_preserve_target_identity() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF (SELECT public.current_app_role())='tl' AND
    (NEW.id IS DISTINCT FROM OLD.id OR NEW.period_id IS DISTINCT FROM OLD.period_id OR
     NEW.store_id IS DISTINCT FROM OLD.store_id OR NEW.model_code IS DISTINCT FROM OLD.model_code) THEN
  RAISE EXCEPTION 'TL cannot change target identity' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.focus_tl_preserve_target_identity() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER focus_tl_preserve_target_identity BEFORE UPDATE ON public.focus_model_targets
 FOR EACH ROW EXECUTE FUNCTION public.focus_tl_preserve_target_identity();
CREATE POLICY focus_targets_tl_insert ON public.focus_model_targets
 FOR INSERT TO authenticated
 WITH CHECK (
  (SELECT public.current_app_role())='tl'
  AND public.can_access_store(store_id)
  AND updated_by=(SELECT auth.uid())
  AND EXISTS (SELECT 1 FROM public.target_periods p WHERE p.id=period_id AND p.status IN ('draft','active'))
  AND EXISTS (SELECT 1 FROM public.focus_model_settings s WHERE s.model_code=focus_model_targets.model_code AND s.is_active)
 );
CREATE POLICY focus_targets_tl_update ON public.focus_model_targets
 FOR UPDATE TO authenticated
 USING ((SELECT public.current_app_role())='tl' AND public.can_access_store(store_id)
   AND EXISTS (SELECT 1 FROM public.target_periods p WHERE p.id=period_id AND p.status IN ('draft','active')))
 WITH CHECK ((SELECT public.current_app_role())='tl' AND public.can_access_store(store_id)
   AND updated_by=(SELECT auth.uid())
   AND EXISTS (SELECT 1 FROM public.target_periods p WHERE p.id=period_id AND p.status IN ('draft','active'))
   AND EXISTS (SELECT 1 FROM public.focus_model_settings s WHERE s.model_code=focus_model_targets.model_code AND s.is_active));
COMMIT;
