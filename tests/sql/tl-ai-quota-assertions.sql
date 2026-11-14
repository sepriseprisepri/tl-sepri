-- Synthetic fixtures only. Run in a disposable PostgreSQL database.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
DO $$ DECLARE i integer; BEGIN
 FOR i IN 1..20 LOOP
   IF public.claim_tl_ai_insight_quota() IS DISTINCT FROM true THEN RAISE EXCEPTION 'TL request % should succeed',i; END IF;
 END LOOP;
 IF public.claim_tl_ai_insight_quota() IS DISTINCT FROM false THEN RAISE EXCEPTION '21st request should fail'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333331',false);
DO $$ BEGIN IF public.claim_tl_ai_insight_quota() IS DISTINCT FROM false THEN RAISE EXCEPTION 'EC should not be allowed'; END IF; END $$;
SELECT set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222223',false);
DO $$ BEGIN IF public.claim_tl_ai_insight_quota() IS DISTINCT FROM true THEN RAISE EXCEPTION 'Other TL has separate quota'; END IF; END $$;
RESET ROLE;
DO $$ BEGIN
 IF has_schema_privilege('authenticated','ai_insights_private','USAGE') THEN RAISE EXCEPTION 'private schema exposed'; END IF;
 IF has_function_privilege('anon','public.claim_tl_ai_insight_quota()','EXECUTE') THEN RAISE EXCEPTION 'anon has RPC access'; END IF;
END $$;
