-- DRAFT ONLY: review and test on an isolated database before applying.
-- The count controls calls per active TL per WIB calendar day; no sales data is stored here.
BEGIN;
CREATE SCHEMA IF NOT EXISTS ai_insights_private;
REVOKE ALL ON SCHEMA ai_insights_private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS ai_insights_private.daily_quota (
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  day date NOT NULL,
  requests integer NOT NULL CHECK (requests BETWEEN 1 AND 20),
  PRIMARY KEY (profile_id, day)
);
ALTER TABLE ai_insights_private.daily_quota ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ai_insights_private.daily_quota FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.claim_tl_ai_insight_quota()
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_uid uuid := auth.uid(); v_count integer;
BEGIN
  IF v_uid IS NULL OR public.current_app_role() IS DISTINCT FROM 'tl' OR NOT EXISTS
    (SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND p.is_active AND p.role = 'tl') THEN
    RETURN false;
  END IF;
  INSERT INTO ai_insights_private.daily_quota AS q (profile_id, day, requests)
  VALUES (v_uid, (now() AT TIME ZONE 'Asia/Pontianak')::date, 1)
  ON CONFLICT (profile_id, day) DO UPDATE SET requests = q.requests + 1
    WHERE q.requests < 20
  RETURNING requests INTO v_count;
  RETURN v_count IS NOT NULL;
END $$;
REVOKE ALL ON FUNCTION public.claim_tl_ai_insight_quota() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_tl_ai_insight_quota() TO authenticated;
COMMIT;
