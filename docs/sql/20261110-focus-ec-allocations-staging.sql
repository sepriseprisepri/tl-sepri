-- STAGING ONLY — Samsung Kalteng TL -> EC Focus Model allocation.
-- Not applied to production. Requires existing role helpers and 19-table recovery RLS.
-- DB schema confirmed via read-only production metadata on 2026-11-10.
BEGIN;

CREATE TABLE IF NOT EXISTS public.focus_model_ec_allocations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 period_id uuid NOT NULL,
 store_id uuid NOT NULL,
 model_code text NOT NULL,
 manpower_id uuid NOT NULL REFERENCES public.manpower(id) ON DELETE RESTRICT,
 target_qty numeric NOT NULL DEFAULT 0 CHECK (target_qty >= 0),
 target_amt numeric NOT NULL DEFAULT 0 CHECK (target_amt >= 0),
 assigned_by uuid NOT NULL REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT focus_ec_unique UNIQUE (period_id,store_id,model_code,manpower_id),
 CONSTRAINT focus_ec_store_model_fk FOREIGN KEY (period_id,store_id,model_code)
  REFERENCES public.focus_model_targets(period_id,store_id,model_code)
  ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS focus_ec_manpower_period_idx
 ON public.focus_model_ec_allocations(manpower_id,period_id);
CREATE INDEX IF NOT EXISTS focus_ec_store_period_idx
 ON public.focus_model_ec_allocations(store_id,period_id,model_code);

CREATE TABLE IF NOT EXISTS public.focus_model_allocation_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 allocation_id uuid NOT NULL,
 period_id uuid NOT NULL,
 store_id uuid NOT NULL,
 model_code text NOT NULL,
 manpower_id uuid NOT NULL,
 action text NOT NULL CHECK (action IN ('create','update','delete')),
 old_qty numeric NOT NULL, new_qty numeric NOT NULL,
 old_amt numeric NOT NULL, new_amt numeric NOT NULL,
 changed_by uuid NOT NULL REFERENCES public.profiles(id),
 changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS focus_ec_history_store_idx
 ON public.focus_model_allocation_history(store_id,changed_at DESC);

ALTER TABLE public.focus_model_ec_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.focus_model_allocation_history ENABLE ROW LEVEL SECURITY;

-- Authenticated can read authorized records only, and cannot change records
-- using the Data API (writes must go through a serialized SECURITY DEFINER RPC).
REVOKE ALL ON public.focus_model_ec_allocations FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.focus_model_allocation_history FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.focus_model_ec_allocations TO authenticated;
GRANT SELECT ON public.focus_model_allocation_history TO authenticated;
GRANT ALL ON public.focus_model_ec_allocations,public.focus_model_allocation_history TO service_role;

DROP POLICY IF EXISTS focus_ec_read_scope ON public.focus_model_ec_allocations;
CREATE POLICY focus_ec_read_scope ON public.focus_model_ec_allocations
 FOR SELECT TO authenticated USING (
  (SELECT public.current_app_role()) IN ('admin','tl','tso')
    AND public.can_access_store(store_id)
  OR
  (SELECT public.current_app_role()) = 'ec'
    AND manpower_id = (
      SELECT p.manpower_id FROM public.profiles p
      WHERE p.id=(SELECT auth.uid()) AND p.is_active IS TRUE
      AND p.must_change_password IS FALSE
    )
    AND EXISTS (
      SELECT 1 FROM public.manpower m
      JOIN public.stores s ON s.site_id=m.site_id
      WHERE m.id=manpower_id AND m.is_active IS TRUE
        AND m.fieldforce_position='EC' AND s.id=store_id
    )
);
DROP POLICY IF EXISTS focus_ec_history_read_scope ON public.focus_model_allocation_history;
CREATE POLICY focus_ec_history_read_scope ON public.focus_model_allocation_history
 FOR SELECT TO authenticated USING (
  (SELECT public.current_app_role()) IN ('admin','tl','tso')
  AND public.can_access_store(store_id)
);
-- Consistent with the recovery mandatory password rotation guard on existing
-- 19 tables. No bypass for users still rotating a temporary password.
DROP POLICY IF EXISTS focus_ec_recovery_gate ON public.focus_model_ec_allocations;
CREATE POLICY focus_ec_recovery_gate ON public.focus_model_ec_allocations
 AS RESTRICTIVE FOR ALL TO authenticated
 USING ((SELECT public.current_app_role()) IS NOT NULL)
 WITH CHECK ((SELECT public.current_app_role()) IS NOT NULL);
DROP POLICY IF EXISTS focus_ec_history_recovery_gate ON public.focus_model_allocation_history;
CREATE POLICY focus_ec_history_recovery_gate ON public.focus_model_allocation_history
 AS RESTRICTIVE FOR ALL TO authenticated
 USING ((SELECT public.current_app_role()) IS NOT NULL)
 WITH CHECK ((SELECT public.current_app_role()) IS NOT NULL);

-- Any Admin update to parent focus targets must honor existing EC allocations.
-- Parent row is locked by UPDATE; RPC also locks it before computing SUM.
CREATE OR REPLACE FUNCTION public.focus_ec_check_parent_capacity()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog,pg_temp
AS $body$
DECLARE allocated_qty numeric; allocated_amt numeric;
BEGIN
 SELECT COALESCE(SUM(a.target_qty),0),COALESCE(SUM(a.target_amt),0)
 INTO allocated_qty,allocated_amt
 FROM public.focus_model_ec_allocations a
 WHERE a.period_id=NEW.period_id AND a.store_id=NEW.store_id
   AND a.model_code=NEW.model_code;
 IF NEW.target_qty < allocated_qty OR NEW.target_amt < allocated_amt THEN
  RAISE EXCEPTION 'Target Focus Model toko tidak boleh lebih rendah dari total alokasi EC'
    USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END
$body$;
DROP TRIGGER IF EXISTS focus_ec_parent_capacity_guard ON public.focus_model_targets;
CREATE TRIGGER focus_ec_parent_capacity_guard
 BEFORE UPDATE OF target_qty,target_amt ON public.focus_model_targets
 FOR EACH ROW EXECUTE FUNCTION public.focus_ec_check_parent_capacity();

CREATE OR REPLACE FUNCTION public.set_focus_model_ec_allocation(
 p_period_id uuid,p_store_id uuid,p_model_code text,p_manpower_id uuid,
 p_target_qty numeric,p_target_amt numeric
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog,pg_temp
AS $body$
DECLARE
 v_actor uuid := (SELECT auth.uid());
 v_role text;
 v_period record;
 v_parent record;
 v_existing record;
 v_qty numeric;
 v_amt numeric;
 v_old_qty numeric := 0;
 v_old_amt numeric := 0;
 v_allocation_id uuid;
 v_action text;
BEGIN
 v_role := public.current_app_role();
 IF v_actor IS NULL OR v_role NOT IN ('admin','tl') OR v_role IS NULL THEN
  RAISE EXCEPTION 'Akses ditolak: hanya TL dalam coverage atau Admin aktif'
   USING ERRCODE='42501';
 END IF;
 IF p_period_id IS NULL OR p_store_id IS NULL OR
    p_manpower_id IS NULL OR NULLIF(trim(p_model_code),'') IS NULL OR
    p_target_qty IS NULL OR p_target_amt IS NULL OR
    p_target_qty<0 OR p_target_amt<0 THEN
  RAISE EXCEPTION 'Alokasi tidak valid: lengkapi identitas dan gunakan target tidak negatif'
   USING ERRCODE='22023';
 END IF;
 -- TL can allocate only to stores in their currently active coverage.
 IF v_role='tl' AND NOT EXISTS (
  SELECT 1 FROM public.coverage_assignments ca
  WHERE ca.profile_id=v_actor AND ca.store_id=p_store_id
    AND ca.coverage_role='tl' AND current_date BETWEEN ca.valid_from
    AND COALESCE(ca.valid_to,'infinity'::date)
 ) THEN
  RAISE EXCEPTION 'Toko di luar coverage TL'
   USING ERRCODE='42501';
 END IF;
 SELECT tp.id,tp.status INTO v_period
 FROM public.target_periods tp WHERE tp.id=p_period_id;
 IF NOT FOUND OR v_period.status NOT IN ('active','draft') THEN
  RAISE EXCEPTION 'Periode target tidak aktif atau sudah ditutup'
   USING ERRCODE='22023';
 END IF;
 -- This lock serializes allocations for all ECs on the same store/model/period
 -- and competes with Admin edits of the parent target.
 SELECT t.id,t.target_qty,t.target_amt,fs.is_active AS model_active
 INTO v_parent FROM public.focus_model_targets t
 JOIN public.focus_model_settings fs ON fs.model_code=t.model_code
 WHERE t.period_id=p_period_id AND t.store_id=p_store_id
   AND t.model_code=p_model_code
 FOR UPDATE OF t;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Target model toko belum dibuat'
   USING ERRCODE='22023';
 END IF;
 -- Deactivated models cannot receive new or increased allocations; existing
 -- target may still be cleared without reactivating the discontinued model.
 IF v_parent.model_active IS NOT TRUE
    AND (p_target_qty<>0 OR p_target_amt<>0) THEN
  RAISE EXCEPTION 'Model tidak aktif; hanya penghapusan alokasi yang diizinkan'
   USING ERRCODE='22023';
 END IF;
 SELECT a.id,a.target_qty,a.target_amt
 INTO v_existing FROM public.focus_model_ec_allocations a
 WHERE a.period_id=p_period_id AND a.store_id=p_store_id
   AND a.model_code=p_model_code AND a.manpower_id=p_manpower_id
 FOR UPDATE;
 IF FOUND THEN
  v_old_qty := v_existing.target_qty;
  v_old_amt := v_existing.target_amt;
 END IF;
 -- A TL must be able to clear an obsolete assignment after an EC transfers
 -- or becomes inactive. The original store coverage still remains mandatory.
 IF NOT (p_target_qty=0 AND p_target_amt=0 AND v_existing.id IS NOT NULL)
 AND NOT EXISTS (
  SELECT 1 FROM public.manpower m
  JOIN public.stores s ON s.site_id=m.site_id
  JOIN public.profiles p ON p.manpower_id=m.id
  WHERE m.id=p_manpower_id AND s.id=p_store_id
    AND m.is_active IS TRUE AND m.fieldforce_position='EC'
    AND p.role='ec' AND p.is_active IS TRUE AND
    p.must_change_password IS FALSE
    AND EXISTS (
      SELECT 1 FROM public.store_assignments sa
      WHERE sa.manpower_id=m.id AND sa.store_id=p_store_id
        AND current_date BETWEEN sa.valid_from AND COALESCE(sa.valid_to,'infinity'::date)
    )
 ) THEN
  RAISE EXCEPTION 'EC belum aktif atau tidak ditempatkan pada toko tersebut'
   USING ERRCODE='22023';
 END IF;
 SELECT COALESCE(SUM(a.target_qty),0)-v_old_qty+p_target_qty,
        COALESCE(SUM(a.target_amt),0)-v_old_amt+p_target_amt
 INTO v_qty,v_amt
 FROM public.focus_model_ec_allocations a
 WHERE a.period_id=p_period_id AND a.store_id=p_store_id
   AND a.model_code=p_model_code;
 IF v_qty>v_parent.target_qty OR v_amt>v_parent.target_amt THEN
  RAISE EXCEPTION 'Alokasi EC melebihi target Focus Model toko'
   USING ERRCODE='23514';
 END IF;
 IF p_target_qty=0 AND p_target_amt=0 THEN
  IF v_existing.id IS NULL THEN
   RETURN jsonb_build_object('ok',true,'action','no_change',
    'allocated_qty',v_qty,'allocated_amt',v_amt);
  END IF;
  DELETE FROM public.focus_model_ec_allocations WHERE id=v_existing.id;
  v_allocation_id := v_existing.id;
  v_action := 'delete';
 ELSIF v_existing.id IS NOT NULL THEN
  UPDATE public.focus_model_ec_allocations
  SET target_qty=p_target_qty,target_amt=p_target_amt,
      assigned_by=v_actor,updated_at=now()
  WHERE id=v_existing.id;
  v_allocation_id := v_existing.id;
  v_action := 'update';
 ELSE
  INSERT INTO public.focus_model_ec_allocations
   (period_id,store_id,model_code,manpower_id,target_qty,target_amt,assigned_by)
  VALUES(p_period_id,p_store_id,p_model_code,p_manpower_id,p_target_qty,p_target_amt,v_actor)
  RETURNING id INTO v_allocation_id;
  v_action := 'create';
 END IF;
 INSERT INTO public.focus_model_allocation_history
  (allocation_id,period_id,store_id,model_code,manpower_id,action,
   old_qty,new_qty,old_amt,new_amt,changed_by)
 VALUES(v_allocation_id,p_period_id,p_store_id,p_model_code,p_manpower_id,
        v_action,v_old_qty,p_target_qty,v_old_amt,p_target_amt,v_actor);
 RETURN jsonb_build_object('ok',true,'action',v_action,'allocation_id',v_allocation_id,
  'allocated_qty',v_qty,'allocated_amt',v_amt,
  'store_target_qty',v_parent.target_qty,'store_target_amt',v_parent.target_amt);
END
$body$;

REVOKE ALL ON FUNCTION public.set_focus_model_ec_allocation(
 uuid,uuid,text,uuid,numeric,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_focus_model_ec_allocation(
 uuid,uuid,text,uuid,numeric,numeric) TO authenticated;

COMMIT;
