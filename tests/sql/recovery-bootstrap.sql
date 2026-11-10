-- ISOLATED TEST DB ONLY. Simulates the minimal Supabase Auth schema.
-- Never run on an existing database / production project.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
INSERT INTO auth.users(id) VALUES
 ('11111111-1111-1111-1111-111111111111'),
 ('22222222-2222-2222-2222-222222222222'),
 ('33333333-3333-3333-3333-333333333333');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;

CREATE TABLE public.profiles (
 id uuid PRIMARY KEY REFERENCES auth.users(id),
 role text NOT NULL,
 is_active boolean NOT NULL DEFAULT false,
 must_change_password boolean NOT NULL DEFAULT false
);
INSERT INTO public.profiles(id,role,is_active,must_change_password) VALUES
 ('11111111-1111-1111-1111-111111111111','admin',true,false),
 ('22222222-2222-2222-2222-222222222222','tl',false,true),
 ('33333333-3333-3333-3333-333333333333','ec',true,false);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.profiles TO authenticated;
CREATE POLICY profiles_select_self ON public.profiles FOR SELECT TO authenticated
USING (id=auth.uid());
-- This helper mirrors the relevant access dependency; replaced by draft SQL.
CREATE FUNCTION public.current_app_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $$
 SELECT p.role FROM public.profiles p WHERE p.id=auth.uid() AND p.is_active IS TRUE
$$;
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $$
 SELECT COALESCE(public.current_app_role()='admin',false)
$$;
GRANT EXECUTE ON FUNCTION public.current_app_role(),public.is_admin()
TO authenticated;

-- Example protected business table: direct JWT should NOT grant access during recovery.
CREATE TABLE public.protected_market_data (
 id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 market text NOT NULL
);
INSERT INTO public.protected_market_data(market) VALUES ('TEST DUMMY DATA');
ALTER TABLE public.protected_market_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY protected_market_data_by_role ON public.protected_market_data
 FOR SELECT TO authenticated USING (public.current_app_role() IN ('admin','tl','ec'));
GRANT SELECT ON public.protected_market_data TO authenticated;

-- Deliberately permissive ownership-only SELECT, to prove restrictive gate works.
CREATE TABLE public.manpower (
 id uuid PRIMARY KEY,
 profile_id uuid NOT NULL REFERENCES public.profiles(id),
 label text NOT NULL
);
INSERT INTO public.manpower(id,profile_id,label) VALUES
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222','RECOVERY TL DUMMY'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','33333333-3333-3333-3333-333333333333','ACTIVE EC DUMMY');
ALTER TABLE public.manpower ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.manpower TO authenticated;
CREATE POLICY manpower_ownership_without_rotation_check
 ON public.manpower FOR SELECT TO authenticated USING (profile_id=auth.uid());
