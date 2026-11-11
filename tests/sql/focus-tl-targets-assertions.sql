-- Synthetic fixture only; never run against production.
INSERT INTO public.focus_model_settings(model_code,is_active) VALUES ('TEST MODEL',true),('INACTIVE MODEL',false);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
DO $$ DECLARE n int; BEGIN
 INSERT INTO public.focus_model_targets(period_id,store_id,model_code,target_qty,target_amt,updated_by)
 VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','TEST MODEL',5,500,auth.uid());
 BEGIN
 INSERT INTO public.focus_model_targets(period_id,store_id,model_code,target_qty,target_amt,updated_by)
 VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','INACTIVE MODEL',4,400,auth.uid());
 RAISE EXCEPTION 'inactive model allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 UPDATE public.focus_model_targets SET target_qty=12,target_amt=1200,updated_by=auth.uid() WHERE store_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
 GET DIAGNOSTICS n=ROW_COUNT; IF n<>1 THEN RAISE EXCEPTION 'TL own store update rejected'; END IF;
 BEGIN
 INSERT INTO public.focus_model_targets(period_id,store_id,model_code,target_qty,target_amt,updated_by)
 VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2','GALAXY A55',4,400,auth.uid());
 RAISE EXCEPTION 'outside store insert allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
 UPDATE public.focus_model_targets SET store_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',updated_by=auth.uid() WHERE store_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
 RAISE EXCEPTION 'target identity mutation allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333331',false);
DO $$ BEGIN
 BEGIN INSERT INTO public.focus_model_targets(period_id,store_id,model_code,target_qty,target_amt,updated_by)
 VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2','TEST MODEL',1,100,auth.uid());
 RAISE EXCEPTION 'EC insert allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
UPDATE public.target_periods SET status='closed';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
DO $$ DECLARE n int; BEGIN
 UPDATE public.focus_model_targets SET target_qty=15,updated_by=auth.uid() WHERE store_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
 GET DIAGNOSTICS n=ROW_COUNT; IF n<>0 THEN RAISE EXCEPTION 'closed period update allowed'; END IF;
END $$;
RESET ROLE;
