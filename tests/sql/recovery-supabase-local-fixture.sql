-- LOCAL SUPABASE STACK ONLY. This is NOT a production migration.
-- Real GoTrue creates auth.users through the Admin API; this file creates
-- only dummy application tables and their policies on the disposable local DB.
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  employee_id text UNIQUE NOT NULL,
  full_name text NOT NULL DEFAULT 'Test Account',
  role text NOT NULL CHECK (role IN ('admin','tl','ec')),
  is_active boolean NOT NULL DEFAULT true,
  must_change_password boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
CREATE POLICY profiles_self_read ON public.profiles
 FOR SELECT TO authenticated USING (id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog,pg_temp
AS $fixture$
 SELECT p.role FROM public.profiles p
 WHERE p.id=(SELECT auth.uid()) AND p.is_active IS TRUE
$fixture$;

CREATE TABLE IF NOT EXISTS public.recovery_e2e_business_data (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 label text NOT NULL
);
INSERT INTO public.recovery_e2e_business_data(label) VALUES ('DUMMY E2E MARKET DATA');
ALTER TABLE public.recovery_e2e_business_data ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.recovery_e2e_business_data TO authenticated;
GRANT ALL ON public.recovery_e2e_business_data TO service_role;
CREATE POLICY recovery_e2e_business_read ON public.recovery_e2e_business_data
 FOR SELECT TO authenticated
 USING (public.current_app_role() IN ('admin','tl','ec'));

-- Local permissions for the restricted helper; not copied to production.
GRANT EXECUTE ON FUNCTION public.current_app_role() TO authenticated;
