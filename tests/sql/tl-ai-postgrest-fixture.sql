-- Synthetic data only; use exclusively on the disposable CI database.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$
 SELECT NULLIF(COALESCE(NULLIF(current_setting('request.jwt.claim.sub',true),''),current_setting('request.jwt.claims',true)::jsonb->>'sub'),'')::uuid
$f$;
ALTER TABLE public.target_periods ADD COLUMN period_start date, ADD COLUMN period_end date;
INSERT INTO public.target_periods(id,status,period_start,period_end) VALUES ('11111111-1111-4111-8111-111111111111','active','2026-11-01','2026-11-30');
INSERT INTO public.stores VALUES ('22222222-2222-4222-8222-222222222222','S-03','Synthetic TL store'),('33333333-3333-4333-8333-333333333333','S-04','Synthetic outside store');
DELETE FROM public.coverage_assignments WHERE profile_id='22222222-2222-2222-2222-222222222222';
INSERT INTO public.coverage_assignments VALUES ('22222222-2222-2222-2222-222222222222','22222222-2222-4222-8222-222222222222','tl',current_date-7,NULL);
CREATE TABLE public.raw_sellout (id integer PRIMARY KEY,site_id text,sold_at date,qty numeric,eula_status text);
CREATE TABLE public.competitor_sellout (id integer PRIMARY KEY,store_id uuid,sold_at date,qty integer);
INSERT INTO public.raw_sellout VALUES
 (1,'S-03','2026-11-01',5,'VALID'),(2,'S-03','2026-11-03',8,'VALID'),
 (3,'S-04','2026-11-03',999,'VALID'),(4,'S-03','2026-11-03',100,'INVALID');
INSERT INTO public.competitor_sellout VALUES
 (1,'22222222-2222-4222-8222-222222222222','2026-11-01',2),
 (2,'22222222-2222-4222-8222-222222222222','2026-11-03',3),
 (3,'33333333-3333-4333-8333-333333333333','2026-11-03',999);
GRANT SELECT ON public.target_periods,public.raw_sellout,public.competitor_sellout TO authenticated;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.target_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_sellout ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_sellout ENABLE ROW LEVEL SECURITY;
CREATE POLICY test_stores ON public.stores FOR SELECT TO authenticated USING(public.can_access_store(id));
CREATE POLICY test_periods ON public.target_periods FOR SELECT TO authenticated USING(public.current_app_role()='tl');
CREATE POLICY test_sales ON public.raw_sellout FOR SELECT TO authenticated USING(EXISTS (SELECT 1 FROM public.stores s WHERE s.site_id=raw_sellout.site_id AND public.can_access_store(s.id)));
CREATE POLICY test_competitor ON public.competitor_sellout FOR SELECT TO authenticated USING(public.can_access_store(store_id));
CREATE ROLE web_authenticator LOGIN PASSWORD 'integration-test-only' NOINHERIT;
GRANT anon,authenticated TO web_authenticator;
NOTIFY pgrst, 'reload schema';
