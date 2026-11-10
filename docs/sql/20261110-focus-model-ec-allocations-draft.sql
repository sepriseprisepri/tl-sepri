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
  AND EXISTS (
    SELECT 1 FROM public.focus_model_targets ft
    WHERE ft.period_id=focus_model_ec_targets.period_id
      AND ft.store_id=focus_model_ec_targets.store_id
      AND ft.model_code=focus_model_ec_targets.model_code
  )
 );
CREATE POLICY focus_tl_update_scope ON public.focus_model_ec_targets FOR UPDATE TO authenticated
 USING ((SELECT public.current_app_role()) IN ('tl','admin') AND public.can_access_store(store_id))
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
  AND EXISTS (
    SELECT 1 FROM public.focus_model_targets ft
    WHERE ft.period_id=focus_model_ec_targets.period_id
      AND ft.store_id=focus_model_ec_targets.store_id
      AND ft.model_code=focus_model_ec_targets.model_code
  )
 );
CREATE POLICY focus_tl_delete_scope ON public.focus_model_ec_targets FOR DELETE TO authenticated
 USING ((SELECT public.current_app_role()) IN ('tl','admin') AND public.can_access_store(store_id));
-- All writers (including direct PostgREST INSERT/UPDATE) must satisfy the same ceiling.
-- Serialize by locking the parent store/model target before checking the aggregate.
-- Put the SECURITY DEFINER helper in a non-exposed schema; never grant EXECUTE to API roles.
CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION app_private.enforce_focus_ec_allocation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE
  ceiling_qty numeric;
  ceiling_amt numeric;
  allocated_qty numeric;
  allocated_amt numeric;
  excluded_id uuid := NULL;
BEGIN
  IF TG_OP = 'UPDATE' AND
    (NEW.period_id, NEW.manpower_id, NEW.store_id, NEW.model_code)
      IS DISTINCT FROM
    (OLD.period_id, OLD.manpower_id, OLD.store_id, OLD.model_code) THEN
    RAISE EXCEPTION 'Identitas alokasi tidak boleh diubah'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' THEN excluded_id := OLD.id; END IF;

  -- Parent row acts as an exclusive mutex for each (period, store, model).
  SELECT ft.target_qty, ft.target_amt INTO ceiling_qty, ceiling_amt
  FROM public.focus_model_targets AS ft
  WHERE ft.period_id = NEW.period_id
    AND ft.store_id = NEW.store_id
    AND ft.model_code = NEW.model_code
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target model toko belum tersedia'
      USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(SUM(a.target_qty),0), COALESCE(SUM(a.target_amt),0)
    INTO allocated_qty, allocated_amt
  FROM public.focus_model_ec_targets AS a
  WHERE a.period_id=NEW.period_id
    AND a.store_id=NEW.store_id
    AND a.model_code=NEW.model_code
    AND (excluded_id IS NULL OR a.id<>excluded_id);

  IF allocated_qty + NEW.target_qty > ceiling_qty OR
     allocated_amt + NEW.target_amt > ceiling_amt THEN
    RAISE EXCEPTION 'Jumlah alokasi EC melampaui target model toko'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION app_private.enforce_focus_ec_allocation() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS focus_ec_allocation_ceiling ON public.focus_model_ec_targets;
CREATE TRIGGER focus_ec_allocation_ceiling
  BEFORE INSERT OR UPDATE ON public.focus_model_ec_targets
  FOR EACH ROW EXECUTE FUNCTION app_private.enforce_focus_ec_allocation();

-- Parent targets may be reduced later; prevent invalidating existing allocations.
CREATE OR REPLACE FUNCTION app_private.enforce_focus_store_target_ceiling()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE
  used_qty numeric;
  used_amt numeric;
BEGIN
  SELECT COALESCE(SUM(a.target_qty),0), COALESCE(SUM(a.target_amt),0)
    INTO used_qty, used_amt
  FROM public.focus_model_ec_targets AS a
  WHERE a.period_id=NEW.period_id
    AND a.store_id=NEW.store_id
    AND a.model_code=NEW.model_code;
  IF NEW.target_qty < used_qty OR NEW.target_amt < used_amt THEN
    RAISE EXCEPTION 'Target toko tidak boleh lebih kecil dari total alokasi EC'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION app_private.enforce_focus_store_target_ceiling() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS focus_store_target_ceiling ON public.focus_model_targets;
CREATE TRIGGER focus_store_target_ceiling
  BEFORE UPDATE OF target_qty, target_amt ON public.focus_model_targets
  FOR EACH ROW EXECUTE FUNCTION app_private.enforce_focus_store_target_ceiling();
COMMIT;
-- Verify referenced table target_periods and FK types against actual staging schema before execution.
-- Staging tests: EC1 only sees own model targets; EC2 cannot read EC1; TL sees sum per scope.
-- TL cannot assign out-of-scope stores or inactive / unassigned EC.
-- The DB trigger now serializes allocations on the parent target row and enforces the ceiling.
-- Staging tests must cover two concurrent inserts, update racing with insert, parent-target
-- reduction, invalid identity updates, and roles with no table or schema privileges.
-- Exposed API SELECT/INSERT/UPDATE grants are intentional and RLS restricts rows.
-- Compare sum of EC allocations vs store-level targets, flag discrepancies.
-- Rollback after exporting allocation data: DROP TRIGGER focus_store_target_ceiling
-- ON public.focus_model_targets; DROP TABLE public.focus_model_ec_targets;
-- DROP FUNCTION app_private.enforce_focus_store_target_ceiling();
-- DROP FUNCTION app_private.enforce_focus_ec_allocation();
-- Retain private schema if used by other features. Review dependent access first.
