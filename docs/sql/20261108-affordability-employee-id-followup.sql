-- Supplementary migration to make TL/Admin affordability exports accountable.
-- The affordability_surveys table is empty when this is installed.
-- Employee ID is verified by RLS against the caller's own active EC profile.
BEGIN;
ALTER TABLE public.affordability_surveys
 ADD COLUMN employee_id text NOT NULL CHECK (length(trim(employee_id)) BETWEEN 4 AND 40);

DROP POLICY affordability_ec_insert ON public.affordability_surveys;
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
   AND p.employee_id=affordability_surveys.employee_id
   AND p.employee_id=m.employee_id
   AND m.fieldforce_position='EC' AND m.is_active
   AND a.store_id=affordability_surveys.store_id
   AND affordability_surveys.survey_date BETWEEN a.valid_from AND coalesce(a.valid_to,'infinity'::date)
 )
);
COMMIT;
