-- DRAFT MIGRATION / STAGING-FIRST. DO NOT EXECUTE ON PRODUCTION WITHOUT APPROVAL.
-- Competitor sales recorded by EC are isolated from Samsung's admin RAW Sellout import.
-- Brand is a restricted enum; neither Samsung nor ambiguous "Other" is allowed.
BEGIN;

CREATE TABLE IF NOT EXISTS public.competitor_sellout (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 entry_key uuid NOT NULL UNIQUE,
 ec_profile_id uuid NOT NULL REFERENCES public.profiles(id),
 store_id uuid NOT NULL REFERENCES public.stores(id),
 sold_at date NOT NULL,
 brand text NOT NULL CHECK (brand IN
  ('Apple','Xiaomi','POCO','OPPO','vivo','realme','Infinix','TECNO','itel','HONOR','Huawei','Motorola','Nokia')),
 model text NOT NULL CHECK (
  length(trim(model)) BETWEEN 2 AND 100
  AND model !~* '(samsung|galaxy)'
 ),
 variant text NOT NULL DEFAULT '' CHECK (length(variant) <= 80),
 qty integer NOT NULL CHECK (qty BETWEEN 1 AND 100),
 unit_price numeric(16,2) NOT NULL CHECK (unit_price >= 0 AND unit_price <= 1000000000),
 amount numeric(18,2) GENERATED ALWAYS AS (qty * unit_price) STORED,
 notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 500),
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT competitor_sold_at_reasonable CHECK (
  sold_at >= DATE '2024-01-01'
  -- Future date is checked by the insertion policy against CURRENT_DATE.
 )
);
CREATE INDEX IF NOT EXISTS competitor_sellout_ec_date_idx
 ON public.competitor_sellout(ec_profile_id,sold_at DESC);
CREATE INDEX IF NOT EXISTS competitor_sellout_store_date_idx
 ON public.competitor_sellout(store_id,sold_at DESC);
ALTER TABLE public.competitor_sellout ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.competitor_sellout FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.competitor_sellout TO authenticated;
GRANT ALL ON public.competitor_sellout TO service_role;

-- Only the authenticated active EC and a valid assigned store can insert.
-- STORE and EC IDs cannot be forged, and transaction date must fit assignment.
CREATE POLICY competitor_ec_insert_assigned
 ON public.competitor_sellout FOR INSERT TO authenticated
 WITH CHECK (
   ec_profile_id=(SELECT auth.uid())
   AND sold_at <= (now() AT TIME ZONE 'Asia/Pontianak')::date
   AND EXISTS (
     SELECT 1
       FROM public.profiles p
       JOIN public.manpower m ON m.id=p.manpower_id
       JOIN public.store_assignments sa ON sa.manpower_id=m.id
     WHERE p.id=(SELECT auth.uid())
       AND p.role='ec' AND p.is_active=true
       AND m.is_active=true AND m.fieldforce_position='EC'
       AND sa.store_id=competitor_sellout.store_id
       AND competitor_sellout.sold_at BETWEEN sa.valid_from
         AND coalesce(sa.valid_to,'infinity'::date)
   )
 );
CREATE POLICY competitor_ec_read_own
 ON public.competitor_sellout FOR SELECT TO authenticated
 USING (
    ec_profile_id=(SELECT auth.uid())
    AND (SELECT public.current_app_role())='ec'
 );
CREATE POLICY competitor_management_read
 ON public.competitor_sellout FOR SELECT TO authenticated
 USING (
  (SELECT public.current_app_role()) IN ('admin','tl','tso')
  AND public.can_access_store(store_id)
 );
-- Deliberately no UPDATE or DELETE policy for EC, TL, TSO, or Admin.
-- Corrections require a separately reviewed audited workflow.
COMMIT;

-- AFTER STAGING TESTS:
-- 1. EC own-store insert succeeds; other-store and other-user inserts fail.
-- 2. A Samsung/Galaxy model fails even when labeled under another brand.
-- 3. Duplicate entry_key is rejected; quantities & dates validated.
-- 4. Admin/TL/TSO visibility limited by can_access_store.
-- 5. raw_sellout row count unchanged; EC cannot INSERT raw_sellout.
