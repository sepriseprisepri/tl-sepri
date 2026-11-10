-- STAGING FIRST: individual Focus Model allocations, guarded TL writes.
-- Schema mirrors Samsung Kalteng production metadata audited 2026-11-10.
-- Do NOT apply to production without full isolated RLS/RPC verification.
BEGIN;

CREATE TABLE public.focus_model_ec_allocations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 focus_target_id uuid NOT NULL REFERENCES public.focus_model_targets(id) ON DELETE RESTRICT,
 manpower_id uuid NOT NULL REFERENCES public.manpower(id) ON DELETE RESTRICT,
 target_qty numeric NOT NULL DEFAULT 0 CHECK (target_qty >= 0),
 target_amt numeric NOT NULL DEFAULT 0 CHECK (target_amt >= 0),
 assigned_by uuid NOT NULL REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT focus_model_ec_allocations_one_ec UNIQUE (focus_target_id,manpower_id)
);
CREATE INDEX idx_focus_model_ec_allocations_ec ON public.focus_model_ec_allocations(manpower_id);
CREATE INDEX idx_focus_model_ec_allocations_parent ON public.focus_model_ec_allocations(focus_target_id);
ALTER TABLE public.focus_model_ec_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.focus_model_ec_allocations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.focus_model_ec_allocations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.focus_model_ec_allocations TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.focus_model_ec_allocations TO service_role;

-- Read-only through PostgREST. A TL can see only allocations for stores
-- presently in their coverage; EC can see only their own manpower_id.
CREATE POLICY focus_ec_allocations_read_scope ON public.focus_model_ec_allocations
 FOR SELECT TO authenticated USING (
    (SELECT public.current_app_role()) = 'admin'
 OR (
    (SELECT public.current_app_role()) = 'ec'
    AND manpower_id = (SELECT p.manpower_id FROM public.profiles p WHERE p.id=(SELECT auth.uid()))
 )
 OR (
    (SELECT public.current_app_role()) = 'tl'
    AND EXISTS (
      SELECT 1 FROM public.focus_model_targets ft
      JOIN public.coverage_assignments ca ON ca.store_id=ft.store_id
      WHERE ft.id=focus_target_id
        AND ca.profile_id=(SELECT auth.uid()) AND ca.coverage_role='tl'
        AND (now() AT TIME ZONE 'Asia/Pontianak')::date
          BETWEEN ca.valid_from AND COALESCE(ca.valid_to,'infinity'::date)
    )
 )
);
CREATE POLICY focus_ec_allocations_password_rotation_gate
 ON public.focus_model_ec_allocations AS RESTRICTIVE FOR ALL TO authenticated
 USING ((SELECT public.current_app_role()) IS NOT NULL)
 WITH CHECK ((SELECT public.current_app_role()) IS NOT NULL);

-- The function takes only a parent row ID and a manpower UUID. Neither user
-- role, store ID, assigned_by nor model can be supplied by the browser.
CREATE OR REPLACE FUNCTION public.set_focus_model_ec_allocation(
 p_focus_target_id uuid,p_manpower_id uuid,p_target_qty numeric,p_target_amt numeric
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE
 v_actor uuid := auth.uid();
 v_role text := public.current_app_role();
 v_parent public.focus_model_targets%ROWTYPE;
 v_period public.target_periods%ROWTYPE;
 v_ec public.manpower%ROWTYPE;
 v_current date := (now() AT TIME ZONE 'Asia/Pontianak')::date;
 v_other_qty numeric;
 v_other_amt numeric;
 v_row uuid;
BEGIN
 IF v_actor IS NULL OR v_role NOT IN ('tl','admin') THEN
  RAISE EXCEPTION 'Tidak diizinkan mengatur target Focus Model';
 END IF;
 IF p_focus_target_id IS NULL OR p_manpower_id IS NULL
    OR p_target_qty IS NULL OR p_target_amt IS NULL
    OR p_target_qty<0 OR p_target_amt<0
    OR p_target_qty>100000000 OR p_target_amt>100000000000000 THEN
  RAISE EXCEPTION 'Target Qty/Amt harus angka positif atau nol yang valid';
 END IF;
 -- Serialize all assignments of one store/model target through its parent row.
 SELECT * INTO v_parent FROM public.focus_model_targets
 WHERE id=p_focus_target_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Target Focus Model tidak ditemukan'; END IF;
 SELECT * INTO v_period FROM public.target_periods WHERE id=v_parent.period_id;
 IF v_period.status<>'active' OR v_current NOT BETWEEN v_period.period_start AND v_period.period_end THEN
  RAISE EXCEPTION 'Alokasi hanya tersedia pada periode aktif yang sedang berjalan';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.focus_model_settings fm
                WHERE fm.model_code=v_parent.model_code AND fm.is_active IS TRUE) THEN
  RAISE EXCEPTION 'Model tidak aktif';
 END IF;
 IF v_role='tl' AND NOT EXISTS (
  SELECT 1 FROM public.coverage_assignments ca
  WHERE ca.profile_id=v_actor AND ca.coverage_role='tl'
    AND ca.store_id=v_parent.store_id
    AND v_current BETWEEN ca.valid_from AND COALESCE(ca.valid_to,'infinity'::date)
 ) THEN RAISE EXCEPTION 'Toko tidak berada pada coverage TL'; END IF;
 SELECT * INTO v_ec FROM public.manpower WHERE id=p_manpower_id;
 IF NOT FOUND OR v_ec.is_active IS NOT TRUE OR v_ec.fieldforce_position<>'EC' THEN
  RAISE EXCEPTION 'EC tidak aktif atau tidak ditemukan';
 END IF;
 IF NOT EXISTS (
   SELECT 1 FROM public.stores st
   JOIN public.store_assignments sa ON sa.store_id=st.id
   WHERE st.id=v_parent.store_id AND sa.manpower_id=p_manpower_id
     AND v_ec.site_id=st.site_id
     AND v_current BETWEEN sa.valid_from AND COALESCE(sa.valid_to,'infinity'::date)
 ) THEN RAISE EXCEPTION 'EC tidak aktif pada penempatan toko target'; END IF;
 -- Only fully active EC login identities may receive new allocations.
 IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.manpower_id=p_manpower_id
   AND p.role='ec' AND p.is_active IS TRUE AND p.must_change_password IS FALSE) THEN
  RAISE EXCEPTION 'Akun EC belum aktif atau sedang pemulihan password';
 END IF;
 SELECT COALESCE(sum(target_qty),0),COALESCE(sum(target_amt),0)
   INTO v_other_qty,v_other_amt
 FROM public.focus_model_ec_allocations
 WHERE focus_target_id=p_focus_target_id AND manpower_id<>p_manpower_id;
 IF v_other_qty+p_target_qty>v_parent.target_qty
    OR v_other_amt+p_target_amt>v_parent.target_amt THEN
  RAISE EXCEPTION 'Total alokasi EC melebihi target Qty/Amt model toko';
 END IF;
 IF p_target_qty=0 AND p_target_amt=0 THEN
  DELETE FROM public.focus_model_ec_allocations
   WHERE focus_target_id=p_focus_target_id AND manpower_id=p_manpower_id
   RETURNING id INTO v_row;
  RETURN jsonb_build_object('ok',true,'removed',true,'id',v_row);
 END IF;
 INSERT INTO public.focus_model_ec_allocations
  (focus_target_id,manpower_id,target_qty,target_amt,assigned_by)
 VALUES (p_focus_target_id,p_manpower_id,p_target_qty,p_target_amt,v_actor)
 ON CONFLICT (focus_target_id,manpower_id) DO UPDATE
   SET target_qty=EXCLUDED.target_qty,target_amt=EXCLUDED.target_amt,
       assigned_by=EXCLUDED.assigned_by,updated_at=now()
 RETURNING id INTO v_row;
 RETURN jsonb_build_object('ok',true,'removed',false,'id',v_row,
   'target_qty',p_target_qty,'target_amt',p_target_amt);
END;
$fn$;
REVOKE ALL ON FUNCTION public.set_focus_model_ec_allocation(uuid,uuid,numeric,numeric)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_focus_model_ec_allocation(uuid,uuid,numeric,numeric)
 TO authenticated;

-- Prevent Admin from reducing a store/model target below already assigned
-- EC totals; applies to ALL writers and keeps budget invariant.
CREATE OR REPLACE FUNCTION public.guard_focus_model_parent_budget()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=pg_catalog,pg_temp
AS $guard$
DECLARE v_qty numeric; v_amt numeric;
BEGIN
 SELECT COALESCE(sum(a.target_qty),0),COALESCE(sum(a.target_amt),0)
 INTO v_qty,v_amt FROM public.focus_model_ec_allocations a
 WHERE a.focus_target_id=NEW.id;
 IF v_qty>NEW.target_qty OR v_amt>NEW.target_amt THEN
  RAISE EXCEPTION 'Target Focus Model toko tidak boleh lebih kecil dari total alokasi EC';
 END IF;
 RETURN NEW;
END
$guard$;
REVOKE ALL ON FUNCTION public.guard_focus_model_parent_budget() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER focus_model_parent_budget_guard
BEFORE UPDATE OF target_qty,target_amt ON public.focus_model_targets
FOR EACH ROW EXECUTE FUNCTION public.guard_focus_model_parent_budget();
COMMIT;
