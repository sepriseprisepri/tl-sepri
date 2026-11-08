-- STAGING-FIRST DRAFT. NEVER RUN AGAINST PRODUCTION WITHOUT EXPLICIT ACTIVATION APPROVAL.
-- Affordability survey: 1 daily response per EC per assigned store.
-- Survey estimates finance adoption; it does NOT amend Samsung RAW Sellout/KPI.
BEGIN;

CREATE OR REPLACE FUNCTION public.affordability_closings_valid(p_entries jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = ''
AS $$
DECLARE item jsonb;
BEGIN
 IF jsonb_typeof(p_entries) <> 'array'
    OR jsonb_array_length(p_entries) < 1
    OR jsonb_array_length(p_entries) > 25 THEN RETURN false; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_entries) LOOP
  IF jsonb_typeof(item)<>'object'
   OR jsonb_typeof(item->'model') <> 'string'
   OR length(btrim(item->>'model')) NOT BETWEEN 2 AND 100
   OR jsonb_typeof(item->'provider') <> 'string'
   OR item->>'provider' NOT IN (
    'HCI','KREDIVO','FIF','SPEKTRA','YESSSKREDIT','AKULAKU',
    'SPAYLATER','INDODANA','SAMSUNG FINANCE+','KREDITPLUS','BAF','KARTU KREDIT BANK'
   )
   OR jsonb_typeof(item->'qty') <> 'number'
   OR (item->>'qty') !~ '^[0-9]{1,3}$'
  THEN RETURN false; END IF;
  IF (item->>'qty')::integer NOT BETWEEN 1 AND 100 THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
EXCEPTION WHEN others THEN RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.affordability_closings_valid(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.affordability_closings_valid(jsonb) TO authenticated,service_role;

CREATE TABLE public.affordability_surveys (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 ec_profile_id uuid NOT NULL REFERENCES public.profiles(id),
 store_id uuid NOT NULL REFERENCES public.stores(id),
 survey_date date NOT NULL,
 has_multifinance boolean NOT NULL,
 no_finance_confirmed boolean NOT NULL DEFAULT false,
 closings jsonb NOT NULL DEFAULT '[]'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT affordability_one_per_day UNIQUE(ec_profile_id,store_id,survey_date),
 CONSTRAINT affordability_day_valid CHECK (survey_date >= DATE '2024-01-01'),
 CONSTRAINT affordability_answers_valid CHECK (
   (has_multifinance=true AND no_finance_confirmed=false AND public.affordability_closings_valid(closings))
   OR
   (has_multifinance=false AND no_finance_confirmed=true AND closings='[]'::jsonb)
 )
);
CREATE INDEX affordability_survey_store_day_idx ON public.affordability_surveys(store_id,survey_date DESC);
CREATE INDEX affordability_survey_date_idx ON public.affordability_surveys(survey_date DESC);
ALTER TABLE public.affordability_surveys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.affordability_surveys FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.affordability_surveys TO authenticated;
GRANT ALL ON public.affordability_surveys TO service_role;

CREATE POLICY affordability_ec_insert ON public.affordability_surveys
FOR INSERT TO authenticated WITH CHECK (
 ec_profile_id=(SELECT auth.uid())
 AND survey_date=(now() AT TIME ZONE 'Asia/Pontianak')::date
 AND EXISTS (
  SELECT 1 FROM public.profiles p
   JOIN public.manpower m ON m.id=p.manpower_id
   JOIN public.store_assignments a ON a.manpower_id=m.id
  WHERE p.id=(SELECT auth.uid())
   AND p.role='ec' AND p.is_active AND NOT p.must_change_password
   AND m.fieldforce_position='EC' AND m.is_active
   AND a.store_id=affordability_surveys.store_id
   AND affordability_surveys.survey_date BETWEEN a.valid_from AND coalesce(a.valid_to,'infinity'::date)
 )
);
CREATE POLICY affordability_ec_read_own ON public.affordability_surveys
FOR SELECT TO authenticated USING (
 ec_profile_id=(SELECT auth.uid()) AND (SELECT public.current_app_role())='ec'
);
CREATE POLICY affordability_management_read ON public.affordability_surveys
FOR SELECT TO authenticated USING (
 (SELECT public.current_app_role())='admin'
 OR ((SELECT public.current_app_role())='tl' AND public.can_access_store(store_id))
);
-- No UPDATE/DELETE policies. Correct a submitted daily survey only via a
-- separately reviewed Admin workflow with an audit trail.
COMMIT;
