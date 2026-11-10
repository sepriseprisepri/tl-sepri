-- LOCAL SUPABASE CLI ONLY: use real GoTrue auth.users and real PostgREST.
-- No production user accounts, sales data, or cloud credentials.
CREATE TABLE public.stores(
 id uuid PRIMARY KEY,site_id text UNIQUE NOT NULL,site_name text NOT NULL
);
CREATE TABLE public.manpower(
 id uuid PRIMARY KEY,full_name text NOT NULL,site_id text,
 fieldforce_position text NOT NULL,promoter_id text,is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.profiles(
 id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 role text NOT NULL,manpower_id uuid REFERENCES public.manpower(id),
 is_active boolean NOT NULL DEFAULT true,
 must_change_password boolean NOT NULL DEFAULT false
);
CREATE TABLE public.target_periods(id uuid PRIMARY KEY,status text NOT NULL);
CREATE TABLE public.focus_model_settings(model_code text PRIMARY KEY,
 display_name text NOT NULL,is_active boolean NOT NULL DEFAULT true);
CREATE TABLE public.focus_model_targets(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 period_id uuid NOT NULL REFERENCES public.target_periods(id),
 store_id uuid NOT NULL REFERENCES public.stores(id),
 model_code text NOT NULL REFERENCES public.focus_model_settings(model_code),
 target_qty numeric NOT NULL CHECK(target_qty>=0),
 target_amt numeric NOT NULL CHECK(target_amt>=0),
 updated_by uuid REFERENCES public.profiles(id),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(period_id,store_id,model_code)
);
CREATE TABLE public.coverage_assignments(
 profile_id uuid NOT NULL REFERENCES public.profiles(id),
 store_id uuid NOT NULL REFERENCES public.stores(id),
 coverage_role text NOT NULL,valid_from date NOT NULL,valid_to date
);
CREATE TABLE public.store_assignments(
 manpower_id uuid NOT NULL REFERENCES public.manpower(id),
 store_id uuid NOT NULL REFERENCES public.stores(id),
 valid_from date NOT NULL,valid_to date
);
CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $f$
 SELECT p.role FROM public.profiles p WHERE p.id=(SELECT auth.uid())
 AND p.is_active IS TRUE AND p.must_change_password IS FALSE
$f$;
CREATE OR REPLACE FUNCTION public.can_access_store(p_store_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $f$
 SELECT COALESCE(public.current_app_role()='admin',false)
 OR EXISTS(
  SELECT 1 FROM public.coverage_assignments c
  WHERE c.profile_id=auth.uid() AND c.store_id=p_store_id
  AND c.coverage_role=public.current_app_role()
  AND current_date BETWEEN c.valid_from AND COALESCE(c.valid_to,'infinity'::date))
 OR EXISTS(
  SELECT 1 FROM public.profiles p
  JOIN public.manpower m ON m.id=p.manpower_id
  JOIN public.store_assignments sa ON sa.manpower_id=m.id
  WHERE p.id=auth.uid() AND p.role='ec'
  AND p.is_active AND NOT p.must_change_password
  AND sa.store_id=p_store_id
  AND current_date BETWEEN sa.valid_from AND COALESCE(sa.valid_to,'infinity'::date))
$f$;
GRANT EXECUTE ON FUNCTION public.current_app_role(),public.can_access_store(uuid)
 TO authenticated;
DO $f$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['profiles','manpower','stores','target_periods',
 'focus_model_settings','focus_model_targets','coverage_assignments','store_assignments']
 LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 END LOOP;
END $f$;
GRANT SELECT ON public.profiles,public.manpower,public.stores,
 public.target_periods,public.focus_model_settings,public.focus_model_targets,
 public.coverage_assignments,public.store_assignments TO authenticated;
GRANT INSERT,UPDATE,DELETE ON public.focus_model_targets TO authenticated;
GRANT ALL ON public.profiles,public.manpower,public.stores,
 public.target_periods,public.focus_model_settings,public.focus_model_targets,
 public.coverage_assignments,public.store_assignments TO service_role;
CREATE POLICY profile_read ON public.profiles FOR SELECT TO authenticated
 USING(id=auth.uid() OR public.current_app_role()='admin');
CREATE POLICY manpower_read ON public.manpower FOR SELECT TO authenticated
 USING(id=(SELECT manpower_id FROM public.profiles WHERE id=auth.uid())
 OR EXISTS(SELECT 1 FROM public.stores s
  WHERE s.site_id=manpower.site_id AND public.can_access_store(s.id)));
CREATE POLICY stores_read ON public.stores FOR SELECT TO authenticated
 USING(public.can_access_store(id));
CREATE POLICY target_periods_read ON public.target_periods FOR SELECT TO authenticated
 USING(public.current_app_role() IS NOT NULL);
CREATE POLICY focus_model_settings_read ON public.focus_model_settings
 FOR SELECT TO authenticated USING(public.current_app_role() IS NOT NULL);
CREATE POLICY focus_targets_read_authorized ON public.focus_model_targets
 FOR SELECT TO authenticated USING(public.can_access_store(store_id));
CREATE POLICY focus_targets_admin_manage ON public.focus_model_targets
 FOR ALL TO authenticated USING(public.current_app_role()='admin')
 WITH CHECK(public.current_app_role()='admin');
CREATE POLICY coverage_read ON public.coverage_assignments FOR SELECT TO authenticated
 USING(profile_id=auth.uid() OR public.current_app_role()='admin');
CREATE POLICY store_assignments_read ON public.store_assignments
 FOR SELECT TO authenticated USING(public.can_access_store(store_id)
 OR manpower_id=(SELECT manpower_id FROM public.profiles WHERE id=auth.uid()));

INSERT INTO public.stores(id,site_id,site_name) VALUES
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','S-01','Dummy Store One'),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2','S-02','Dummy Store Two');
INSERT INTO public.manpower(id,full_name,site_id,fieldforce_position,promoter_id)
VALUES
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','Dummy EC One','S-01','EC','P001'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2','Dummy EC Two','S-01','EC','P002'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3','Dummy EC Outside','S-02','EC','P003');
INSERT INTO public.target_periods VALUES
 ('cccccccc-cccc-cccc-cccc-cccccccccccc','active');
INSERT INTO public.focus_model_settings VALUES
 ('GALAXY A55','Galaxy A55',true);
INSERT INTO public.focus_model_targets(period_id,store_id,model_code,target_qty,target_amt)
VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc',
 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','GALAXY A55',10,1000);
INSERT INTO public.store_assignments VALUES
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',current_date-7,NULL),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',current_date-7,NULL),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',current_date-7,NULL);
