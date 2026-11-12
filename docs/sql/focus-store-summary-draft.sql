-- Draft: store-level Focus Model totals; preserve legacy allocation records.
BEGIN;
CREATE FUNCTION public.focus_model_store_summary(p_period_id uuid)
 RETURNS TABLE(store_id uuid,model_code text,target_qty numeric,target_amt numeric,actual_qty numeric,actual_amt numeric)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_role text;
BEGIN
 v_role:=public.current_app_role();
 IF auth.uid() IS NULL OR v_role NOT IN ('admin','tl','tso','ec') OR v_role IS NULL THEN
  RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501';
 END IF;
 RETURN QUERY
 WITH visible_targets AS (
  SELECT t.store_id,t.model_code,t.target_qty,t.target_amt,s.site_id,p.period_start,p.period_end
  FROM public.focus_model_targets t
  JOIN public.stores s ON s.id=t.store_id
  JOIN public.target_periods p ON p.id=t.period_id
  WHERE t.period_id=p_period_id AND public.can_access_store(t.store_id)
   AND (v_role<>'ec' OR EXISTS (
    SELECT 1 FROM public.profiles pr JOIN public.manpower m ON m.id=pr.manpower_id
    JOIN public.store_assignments a ON a.manpower_id=m.id AND a.store_id=t.store_id
    WHERE pr.id=auth.uid() AND pr.is_active AND m.is_active AND m.fieldforce_position='EC'
      AND m.site_id=s.site_id AND (now() AT TIME ZONE 'Asia/Pontianak')::date BETWEEN a.valid_from AND COALESCE(a.valid_to,'infinity'::date)))
 ), aliases AS (
  SELECT DISTINCT sm.model_code,regexp_replace(upper(alias.value),'[^A-Z0-9]','','g') AS normalized
  FROM public.focus_model_settings sm CROSS JOIN LATERAL (VALUES (sm.model_code),(sm.display_name)) alias(value)
 ), unique_aliases AS (
  SELECT normalized,min(a.model_code) AS model_code FROM aliases a WHERE normalized<>'' GROUP BY normalized HAVING count(DISTINCT a.model_code)=1
 )
 SELECT vt.store_id,vt.model_code,vt.target_qty,vt.target_amt,
        COALESCE(sum(r.qty),0)::numeric,COALESCE(sum(r.amt),0)::numeric
 FROM visible_targets vt
 LEFT JOIN public.raw_sellout r ON r.site_id=vt.site_id
  AND upper(r.eula_status)='VALID' AND r.sold_at BETWEEN vt.period_start AND LEAST(vt.period_end,(now() AT TIME ZONE 'Asia/Pontianak')::date)
  AND EXISTS (SELECT 1 FROM unique_aliases ua WHERE ua.model_code=vt.model_code AND ua.normalized=regexp_replace(upper(r.model),'[^A-Z0-9]','','g'))
 GROUP BY vt.store_id,vt.model_code,vt.target_qty,vt.target_amt;
END $$;
REVOKE ALL ON FUNCTION public.focus_model_store_summary(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.focus_model_store_summary(uuid) TO authenticated;
-- Stop new individual allocations; keep existing data and audit for rollback.
REVOKE EXECUTE ON FUNCTION public.set_focus_model_ec_allocation(uuid,uuid,text,uuid,numeric,numeric) FROM authenticated;
COMMIT;
