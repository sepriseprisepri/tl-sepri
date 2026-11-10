-- Disposable PostgreSQL integration fixture, no real user or business data.
-- Minimal schema of Master Database tables used by the CURRENT production RPC.
-- Existing profiles/manpower originate from tests/sql/recovery-bootstrap.sql.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name text;
UPDATE public.profiles SET full_name=CASE role WHEN 'admin' THEN 'DUMMY ADMIN'
 WHEN 'tl' THEN 'DUMMY TL' ELSE 'DUMMY EC' END;

ALTER TABLE public.manpower ADD COLUMN IF NOT EXISTS employee_id text;
ALTER TABLE public.manpower ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE public.manpower ADD COLUMN IF NOT EXISTS position text;
ALTER TABLE public.manpower ADD COLUMN IF NOT EXISTS fieldforce_position text;
ALTER TABLE public.manpower ADD COLUMN IF NOT EXISTS promoter_id text;
ALTER TABLE public.manpower ADD COLUMN IF NOT EXISTS site_id text;
ALTER TABLE public.manpower ADD COLUMN IF NOT EXISTS tl_name text;
ALTER TABLE public.manpower ADD COLUMN IF NOT EXISTS tso_name text;
ALTER TABLE public.manpower ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.manpower ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
UPDATE public.manpower SET employee_id=CASE WHEN profile_id='22222222-2222-2222-2222-222222222222'
 THEN 'DUMMY-TL-OLD' ELSE 'DUMMY-EC-OLD' END,
 full_name=label,position='Dummy Staff',fieldforce_position='EC',is_active=true;
CREATE UNIQUE INDEX IF NOT EXISTS manpower_employee_unique_test ON public.manpower(employee_id);

CREATE TABLE public.target_periods (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), period_name text NOT NULL,
 period_start date NOT NULL, period_end date NOT NULL,
 status text NOT NULL DEFAULT 'draft',created_by uuid,created_at timestamptz DEFAULT now()
);
CREATE TABLE public.stores (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),site_id text UNIQUE NOT NULL,
 site_name text NOT NULL,channel_category text,updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.store_targets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),period_id uuid NOT NULL,
 store_id uuid NOT NULL,target_qty numeric NOT NULL DEFAULT 0,
 target_amt numeric NOT NULL DEFAULT 0,updated_at timestamptz DEFAULT now(),
 UNIQUE(period_id,store_id)
);
CREATE TABLE public.store_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),manpower_id uuid NOT NULL,
 store_id uuid NOT NULL,valid_from date NOT NULL,valid_to date
);
CREATE TABLE public.coverage_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),profile_id uuid NOT NULL,
 store_id uuid NOT NULL,coverage_role text NOT NULL,valid_from date NOT NULL,valid_to date
);
CREATE TABLE public.ec_target_allocations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),period_id uuid NOT NULL,
 store_id uuid NOT NULL,manpower_id uuid NOT NULL,
 target_qty numeric NOT NULL DEFAULT 0,target_amt numeric NOT NULL DEFAULT 0,
 updated_at timestamptz DEFAULT now(),UNIQUE(period_id,manpower_id)
);
CREATE TABLE public.import_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),import_type text NOT NULL,file_name text NOT NULL,
 status text NOT NULL,total_rows integer NOT NULL DEFAULT 0,uploaded_by uuid,
 details jsonb NOT NULL DEFAULT '{}'::jsonb, inserted_rows integer DEFAULT 0,
 updated_rows integer DEFAULT 0,invalid_rows integer DEFAULT 0,
 conflict_rows integer DEFAULT 0,completed_at timestamptz
);
INSERT INTO public.target_periods(id,period_name,period_start,period_end)
VALUES('44444444-4444-4444-4444-444444444444','DUMMY NOV 2026','2026-11-01','2026-11-30');

-- Security regression verifies real business workflow with a dummy Admin.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
DO $regression$
DECLARE
 payload jsonb;
 output jsonb;
BEGIN
 payload:=jsonb_build_object(
  'period_id','44444444-4444-4444-4444-444444444444',
  'file_name','CI Master Database Dummy.xlsx',
  'manpower',jsonb_build_array(
    jsonb_build_object('employee_id','DUMMY-EC-NEW','full_name','DUMMY EC IMPORT',
      'position','Experience Consultant','fieldforce_position','EC',
      'promoter_id','DUMMY-PROMO','site_id','DUMMY-SITE',
      'tl_name','DUMMY TL','tso_name','DUMMY TSO')
  ),
  'stores',jsonb_build_array(jsonb_build_object('site_id','DUMMY-SITE',
    'site_name','Dummy Store','channel_category','SE')),
  'targets',jsonb_build_array(jsonb_build_object('site_id','DUMMY-SITE',
    'target_qty',12,'target_amt',36000000)),
  'ec_assignments',jsonb_build_array(
    jsonb_build_object('employee_id','DUMMY-EC-NEW','site_id','DUMMY-SITE')),
  'coverage',jsonb_build_array(
    jsonb_build_object('site_id','DUMMY-SITE','tl_name','DUMMY TL'))
 );
 SELECT public.commit_master_database(payload) INTO output;
 IF output->>'success' IS DISTINCT FROM 'true' THEN
  RAISE EXCEPTION 'Master import should succeed %',output;
 END IF;
 IF (SELECT count(*) FROM public.manpower WHERE employee_id='DUMMY-EC-NEW')<>1 THEN
  RAISE EXCEPTION 'Imported EC is missing';
 END IF;
 IF (SELECT count(*) FROM public.stores WHERE site_id='DUMMY-SITE')<>1 THEN
  RAISE EXCEPTION 'Imported store missing';
 END IF;
 IF (SELECT count(*) FROM public.store_targets WHERE target_qty=12 AND target_amt=36000000)<>1 THEN
  RAISE EXCEPTION 'Targets did not import';
 END IF;
 IF (SELECT count(*) FROM public.store_assignments WHERE valid_to IS NULL
   AND store_id=(SELECT id FROM public.stores WHERE site_id='DUMMY-SITE'))<>1 THEN
  RAISE EXCEPTION 'EC store mapping missing';
 END IF;
 IF (SELECT count(*) FROM public.coverage_assignments WHERE valid_to IS NULL
   AND profile_id='22222222-2222-2222-2222-222222222222')<>1 THEN
  RAISE EXCEPTION 'TL coverage missing';
 END IF;
 IF (SELECT count(*) FROM public.ec_target_allocations
   WHERE target_qty=12 AND target_amt=36000000)<>1 THEN
  RAISE EXCEPTION 'EC target allocation missing';
 END IF;
 IF (SELECT count(*) FROM public.import_history WHERE status='completed')<>1 THEN
  RAISE EXCEPTION 'Import history missing';
 END IF;
 -- Repeat the same payload: upserts should not duplicate stores, manpower,
 -- target rows, EC allocations, or active assignments.
 SELECT public.commit_master_database(payload) INTO output;
 IF output->>'success' IS DISTINCT FROM 'true'
  OR (SELECT count(*) FROM public.manpower WHERE employee_id='DUMMY-EC-NEW')<>1
  OR (SELECT count(*) FROM public.store_assignments WHERE valid_to IS NULL)<>1
  OR (SELECT count(*) FROM public.ec_target_allocations)<>1
 THEN RAISE EXCEPTION 'Second master commit was not idempotent'; END IF;
END
$regression$;
RESET ROLE;
SELECT 'PASS: genuine master RPC business import, EC/TL mapping, targets, idempotent replay' AS outcome;
