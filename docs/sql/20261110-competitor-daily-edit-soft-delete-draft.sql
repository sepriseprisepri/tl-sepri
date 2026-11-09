-- DRAFT ONLY. DO NOT APPLY TO PRODUCTION BEFORE STAGING JWT TESTS AND APPROVAL.
-- Soft delete retains incorrect competitor entries for audit and preserves RAW Sellout.
BEGIN;
ALTER TABLE public.competitor_sellout
 ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- SELECT policies created in original competitor migration must hide deleted entries.
DROP POLICY IF EXISTS competitor_ec_read_own ON public.competitor_sellout;
CREATE POLICY competitor_ec_read_own ON public.competitor_sellout FOR SELECT TO authenticated
 USING (ec_profile_id=(SELECT auth.uid()) AND (SELECT public.current_app_role())='ec' AND deleted_at IS NULL);
DROP POLICY IF EXISTS competitor_management_read ON public.competitor_sellout;
CREATE POLICY competitor_management_read ON public.competitor_sellout FOR SELECT TO authenticated
 USING ((SELECT public.current_app_role()) IN ('admin','tl','tso') AND public.can_access_store(store_id) AND deleted_at IS NULL);

REVOKE UPDATE,DELETE ON public.competitor_sellout FROM authenticated;
GRANT UPDATE(brand,model,variant,qty,unit_price,notes,deleted_at,updated_at)
 ON public.competitor_sellout TO authenticated;
-- Raw DELETE remains forbidden: soft delete uses updated deleted_at only.

CREATE POLICY competitor_ec_update_today ON public.competitor_sellout FOR UPDATE TO authenticated
 USING (
   ec_profile_id=(SELECT auth.uid())
   AND (SELECT public.current_app_role())='ec'
   AND deleted_at IS NULL
   AND sold_at=(now() AT TIME ZONE 'Asia/Pontianak')::date
   AND (created_at AT TIME ZONE 'Asia/Pontianak')::date=(now() AT TIME ZONE 'Asia/Pontianak')::date
   AND EXISTS (
    SELECT 1 FROM public.profiles p JOIN public.manpower m ON m.id=p.manpower_id
      JOIN public.store_assignments sa ON sa.manpower_id=m.id
    WHERE p.id=(SELECT auth.uid()) AND p.role='ec' AND p.is_active
      AND NOT p.must_change_password AND m.is_active AND m.fieldforce_position='EC'
      AND sa.store_id=competitor_sellout.store_id
      AND (now() AT TIME ZONE 'Asia/Pontianak')::date BETWEEN sa.valid_from AND COALESCE(sa.valid_to,'infinity'::date)
   )
 )
 WITH CHECK (
   ec_profile_id=(SELECT auth.uid()) AND (SELECT public.current_app_role())='ec'
   AND sold_at=(now() AT TIME ZONE 'Asia/Pontianak')::date
 );
CREATE OR REPLACE FUNCTION public.guard_competitor_daily_edit()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF OLD.ec_profile_id IS DISTINCT FROM NEW.ec_profile_id
  OR OLD.store_id IS DISTINCT FROM NEW.store_id
  OR OLD.entry_key IS DISTINCT FROM NEW.entry_key
  OR OLD.sold_at IS DISTINCT FROM NEW.sold_at
  OR OLD.created_at IS DISTINCT FROM NEW.created_at
  OR OLD.id IS DISTINCT FROM NEW.id
 THEN RAISE EXCEPTION 'Field identitas transaksi tidak boleh diubah'; END IF;
 IF OLD.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Transaksi sudah dihapus'; END IF;
 IF NEW.deleted_at IS NOT NULL THEN
  IF NEW.deleted_at NOT BETWEEN now() - interval '3 minutes' AND now() + interval '3 minutes'
   THEN RAISE EXCEPTION 'Waktu hapus tidak valid'; END IF;
  IF (NEW.brand,NEW.model,NEW.variant,NEW.qty,NEW.unit_price,NEW.notes)
   IS DISTINCT FROM (OLD.brand,OLD.model,OLD.variant,OLD.qty,OLD.unit_price,OLD.notes)
   THEN RAISE EXCEPTION 'Hapus dan edit tidak boleh digabung'; END IF;
 END IF;
 NEW.updated_at=now();
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_competitor_daily_edit() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER competitor_daily_edit_guard BEFORE UPDATE ON public.competitor_sellout
 FOR EACH ROW EXECUTE FUNCTION public.guard_competitor_daily_edit();
COMMIT;
