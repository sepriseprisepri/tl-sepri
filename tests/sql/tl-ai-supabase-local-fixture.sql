-- Disposable local Supabase only; synthetic rows and fixture RLS, not production policies.
ALTER TABLE public.target_periods ADD COLUMN period_start date, ADD COLUMN period_end date;
INSERT INTO public.target_periods(id,status,period_start,period_end) VALUES ('11111111-1111-4111-8111-111111111111','active','2026-11-01','2026-11-30');
INSERT INTO public.stores VALUES ('22222222-2222-4222-8222-222222222222','S-03','Test store'),('33333333-3333-4333-8333-333333333333','S-04','Outside store');
CREATE TABLE public.raw_sellout(id integer PRIMARY KEY,site_id text,sold_at date,qty numeric,eula_status text);
CREATE TABLE public.competitor_sellout(id integer PRIMARY KEY,store_id uuid,sold_at date,qty integer);
INSERT INTO public.raw_sellout VALUES (1,'S-03','2026-11-01',5,'VALID'),(2,'S-03','2026-11-03',8,'VALID'),(3,'S-04','2026-11-03',999,'VALID');
INSERT INTO public.competitor_sellout VALUES (1,'22222222-2222-4222-8222-222222222222','2026-11-01',2),(2,'22222222-2222-4222-8222-222222222222','2026-11-03',3),(3,'33333333-3333-4333-8333-333333333333','2026-11-03',999);
ALTER TABLE public.raw_sellout ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_sellout ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.raw_sellout,public.competitor_sellout TO authenticated;
CREATE POLICY sales_read ON public.raw_sellout FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.stores s WHERE s.site_id=raw_sellout.site_id AND public.can_access_store(s.id)));
CREATE POLICY competitor_read ON public.competitor_sellout FOR SELECT TO authenticated USING(public.can_access_store(store_id));
