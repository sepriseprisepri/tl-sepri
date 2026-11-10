-- Dedicated disposable PostgreSQL fixture for Focus Model TL -> EC tests.
-- Every ID below is synthetic. NEVER run against production.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$
 SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid
$f$;
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,service_role;

CREATE TABLE public.profiles(
 id uuid PRIMARY KEY,role text NOT NULL,manpower_id uuid,
 is_active boolean NOT NULL DEFAULT true,must_change_password boolean NOT NULL DEFAULT false
);
CREATE TABLE public.stores(id uuid PRIMARY KEY,site_id text UNIQUE NOT NULL,site_name text NOT NULL);
CREATE TABLE public.manpower(
 id uuid PRIMARY KEY,full_name text NOT NULL,site_id text,fieldforce_position text,
 promoter_id text,is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.target_periods(id uuid PRIMARY KEY,status text NOT NULL);
CREATE TABLE public.focus_model_settings(model_code text PRIMARY KEY,is_active boolean NOT NULL);
CREATE TABLE public.focus_model_targets(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 period_id uuid NOT NULL REFERENCES public.target_periods(id),
 store_id uuid NOT NULL REFERENCES public.stores(id),model_code text NOT NULL REFERENCES public.focus_model_settings(model_code),
 target_qty numeric NOT NULL DEFAULT 0 CHECK(target_qty>=0),
 target_amt numeric NOT NULL DEFAULT 0 CHECK(target_amt>=0),
 UNIQUE(period_id,store_id,model_code)
);
CREATE TABLE public.coverage_assignments(
 profile_id uuid NOT NULL,store_id uuid NOT NULL,coverage_role text NOT NULL,
 valid_from date NOT NULL,valid_to date
);
CREATE TABLE public.store_assignments(
 manpower_id uuid NOT NULL,store_id uuid NOT NULL,
 valid_from date NOT NULL,valid_to date
);
INSERT INTO public.stores VALUES
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','S-01','Dummy Store One'),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2','S-02','Dummy Store Two');
INSERT INTO public.manpower VALUES
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','Dummy EC One','S-01','EC','P001',true),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2','Dummy EC Two','S-01','EC','P002',true),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3','Dummy EC Outside','S-02','EC','P003',true);
INSERT INTO public.profiles VALUES
 ('11111111-1111-1111-1111-111111111111','admin',NULL,true,false),
 ('22222222-2222-2222-2222-222222222222','tl',NULL,true,false),
 ('22222222-2222-2222-2222-222222222223','tl',NULL,true,false),
 ('33333333-3333-3333-3333-333333333331','ec','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',true,false),
 ('33333333-3333-3333-3333-333333333332','ec','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',true,false),
 ('33333333-3333-3333-3333-333333333333','ec','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3',true,false);
INSERT INTO public.target_periods VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc','active');
INSERT INTO public.focus_model_settings VALUES ('GALAXY A55',true);
INSERT INTO public.focus_model_targets(period_id,store_id,model_code,target_qty,target_amt)
VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc',
 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','GALAXY A55',10,1000);
INSERT INTO public.coverage_assignments VALUES
 ('22222222-2222-2222-2222-222222222222','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','tl',current_date-7,NULL),
 ('22222222-2222-2222-2222-222222222223','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2','tl',current_date-7,NULL);
INSERT INTO public.store_assignments VALUES
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',current_date-7,NULL),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',current_date-7,NULL),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',current_date-7,NULL);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.profiles TO authenticated;
CREATE POLICY profiles_self_read ON public.profiles FOR SELECT TO authenticated
USING(id=auth.uid());
CREATE FUNCTION public.current_app_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $f$
 SELECT p.role FROM public.profiles p WHERE p.id=auth.uid()
 AND p.is_active IS TRUE AND p.must_change_password IS FALSE
$f$;
CREATE FUNCTION public.can_access_store(p_store_id uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
 SELECT COALESCE(public.current_app_role()='admin',false) OR
 EXISTS(SELECT 1 FROM public.coverage_assignments c WHERE c.store_id=p_store_id
 AND c.profile_id=auth.uid() AND c.coverage_role=public.current_app_role()
 AND current_date BETWEEN c.valid_from AND COALESCE(c.valid_to,'infinity'::date))
$f$;
GRANT EXECUTE ON FUNCTION public.current_app_role(),public.can_access_store(uuid) TO authenticated;

-- Existing production policies grant authenticated SELECT on these master-data
-- tables (with their own RLS); this minimal fixture needs those SQL grants for
-- allocation-RLS subqueries to run under the authenticated role.
GRANT SELECT ON public.manpower,public.stores TO authenticated;
