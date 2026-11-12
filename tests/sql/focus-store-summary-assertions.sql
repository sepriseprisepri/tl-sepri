-- Synthetic fixture only. The store total includes sales from two ECs.
ALTER TABLE public.target_periods ADD COLUMN period_start date DEFAULT current_date-10, ADD COLUMN period_end date DEFAULT current_date+10;
ALTER TABLE public.focus_model_settings ADD COLUMN display_name text DEFAULT 'Galaxy A55';
CREATE TABLE public.raw_sellout(site_id text,model text,eula_status text,sold_at date,qty numeric,amt numeric);
INSERT INTO public.raw_sellout VALUES
 ('S-01','Galaxy A55','VALID',current_date-1,2,200),
 ('S-01','Galaxy A55','VALID',current_date-1,3,300),
 ('S-01','Galaxy A55','PENDING',current_date-1,9,900),
 ('S-02','Galaxy A55','VALID',current_date-1,12,1200);
\i docs/sql/focus-store-summary-draft.sql
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333331',false);
DO $$ DECLARE row_data record; BEGIN
 SELECT * INTO row_data FROM public.focus_model_store_summary('cccccccc-cccc-cccc-cccc-cccccccccccc');
 IF row_data.target_qty<>10 OR row_data.actual_qty<>5 OR row_data.actual_amt<>500 THEN RAISE EXCEPTION 'wrong shared store total %',row_data; END IF;
 IF has_table_privilege('authenticated','public.raw_sellout','SELECT') THEN RAISE EXCEPTION 'raw rows exposed'; END IF;
 IF has_function_privilege('authenticated','public.set_focus_model_ec_allocation(uuid,uuid,text,uuid,numeric,numeric)','EXECUTE') THEN RAISE EXCEPTION 'individual allocation still writable'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.focus_model_store_summary('cccccccc-cccc-cccc-cccc-cccccccccccc')) THEN RAISE EXCEPTION 'other store leaked'; END IF; END $$;
SELECT set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
DO $$ DECLARE n numeric; BEGIN SELECT actual_qty INTO n FROM public.focus_model_store_summary('cccccccc-cccc-cccc-cccc-cccccccccccc'); IF n<>5 THEN RAISE EXCEPTION 'TL total incorrect'; END IF; END $$;
RESET ROLE;
INSERT INTO public.focus_model_settings(model_code,is_active,display_name) VALUES ('OTHER MODEL',true,'Galaxy A55');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
DO $$ DECLARE n numeric; BEGIN SELECT actual_qty INTO n FROM public.focus_model_store_summary('cccccccc-cccc-cccc-cccc-cccccccccccc'); IF n<>0 THEN RAISE EXCEPTION 'ambiguous model was counted'; END IF; END $$;
RESET ROLE;
UPDATE public.profiles SET must_change_password=true WHERE id='33333333-3333-3333-3333-333333333331';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333331',false);
DO $$ BEGIN BEGIN PERFORM public.focus_model_store_summary('cccccccc-cccc-cccc-cccc-cccccccccccc'); RAISE EXCEPTION 'recovery gate bypass'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;
RESET ROLE;
