-- Runs only with synthetic fixture and disposable PostgreSQL.
INSERT INTO public.competitor_sellout(id,entry_key,ec_profile_id,store_id,sold_at,brand,model,qty,unit_price,created_at)
VALUES
 ('44444444-4444-4444-4444-444444444441','55555555-5555-5555-5555-555555555551','33333333-3333-3333-3333-333333333331','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',current_date,'Apple','iPhone',1,100,now()),
 ('44444444-4444-4444-4444-444444444442','55555555-5555-5555-5555-555555555552','33333333-3333-3333-3333-333333333332','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',current_date,'Apple','iPhone',1,100,now()),
 ('44444444-4444-4444-4444-444444444443','55555555-5555-5555-5555-555555555553','33333333-3333-3333-3333-333333333331','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',current_date-1,'Apple','iPhone',1,100,now()-interval '2 days');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333331',false);
DO $$ DECLARE n int; BEGIN
 UPDATE public.competitor_sellout SET qty=2 WHERE id='44444444-4444-4444-4444-444444444441'; GET DIAGNOSTICS n=ROW_COUNT; IF n<>1 THEN RAISE EXCEPTION 'own update failed'; END IF;
 UPDATE public.competitor_sellout SET qty=2 WHERE id='44444444-4444-4444-4444-444444444442'; GET DIAGNOSTICS n=ROW_COUNT; IF n<>0 THEN RAISE EXCEPTION 'other EC update allowed'; END IF;
 DELETE FROM public.competitor_sellout WHERE id='44444444-4444-4444-4444-444444444443'; GET DIAGNOSTICS n=ROW_COUNT; IF n<>0 THEN RAISE EXCEPTION 'old delete allowed'; END IF;
 BEGIN UPDATE public.competitor_sellout SET store_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2' WHERE id='44444444-4444-4444-4444-444444444441'; RAISE EXCEPTION 'store update allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE public.competitor_sellout SET model='Samsung Galaxy' WHERE id='44444444-4444-4444-4444-444444444441'; RAISE EXCEPTION 'Samsung model allowed'; EXCEPTION WHEN check_violation THEN NULL; END;
 DELETE FROM public.competitor_sellout WHERE id='44444444-4444-4444-4444-444444444441'; GET DIAGNOSTICS n=ROW_COUNT; IF n<>1 THEN RAISE EXCEPTION 'own delete failed'; END IF;
 IF (SELECT count(*) FROM public.competitor_correction_history)<>2 THEN RAISE EXCEPTION 'missing audit'; END IF;
END $$;
RESET ROLE;
UPDATE public.profiles SET must_change_password=true WHERE id='33333333-3333-3333-3333-333333333332';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333332',false);
DO $$ DECLARE n int; BEGIN DELETE FROM public.competitor_sellout WHERE id='44444444-4444-4444-4444-444444444442'; GET DIAGNOSTICS n=ROW_COUNT; IF n<>0 THEN RAISE EXCEPTION 'recovery guard bypass'; END IF; END $$;
RESET ROLE;
