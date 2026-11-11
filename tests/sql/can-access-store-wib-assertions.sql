-- Synthetic data only; run on an isolated PostgreSQL database.
DO $$ BEGIN
 IF ('2026-11-11 16:59:59+00'::timestamptz AT TIME ZONE 'Asia/Pontianak')::date <> '2026-11-11'::date
 OR ('2026-11-11 17:00:00+00'::timestamptz AT TIME ZONE 'Asia/Pontianak')::date <> '2026-11-12'::date
 THEN RAISE EXCEPTION 'WIB midnight boundary mismatch'; END IF;
END $$;
INSERT INTO public.profiles(id,role) VALUES ('44444444-4444-4444-4444-444444444444','tso');
INSERT INTO public.coverage_assignments VALUES
 ('44444444-4444-4444-4444-444444444444','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','tl',(now() at time zone 'Asia/Pontianak')::date,NULL);
UPDATE public.coverage_assignments SET valid_from=(now() at time zone 'Asia/Pontianak')::date,valid_to=(now() at time zone 'Asia/Pontianak')::date WHERE profile_id='22222222-2222-2222-2222-222222222222';
UPDATE public.store_assignments SET valid_from=(now() at time zone 'Asia/Pontianak')::date,valid_to=(now() at time zone 'Asia/Pontianak')::date WHERE manpower_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
DO $$ BEGIN IF NOT public.can_access_store('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1') OR public.can_access_store('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2') THEN RAISE EXCEPTION 'TL scope incorrect'; END IF; END $$;
SELECT set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333331',false);
DO $$ BEGIN IF NOT public.can_access_store('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1') OR public.can_access_store('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2') THEN RAISE EXCEPTION 'EC scope incorrect'; END IF; END $$;
SELECT set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444',false);
DO $$ BEGIN IF NOT public.can_access_store('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1') THEN RAISE EXCEPTION 'TSO scope incorrect'; END IF; END $$;
SELECT set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
DO $$ BEGIN IF NOT public.can_access_store('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2') THEN RAISE EXCEPTION 'Admin scope incorrect'; END IF; END $$;
RESET ROLE;
UPDATE public.profiles SET must_change_password=true WHERE id='44444444-4444-4444-4444-444444444444';
UPDATE public.profiles SET is_active=false WHERE id='11111111-1111-1111-1111-111111111111';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444',false);
DO $$ BEGIN IF public.can_access_store('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1') THEN RAISE EXCEPTION 'password recovery guard bypass'; END IF; END $$;
SELECT set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
DO $$ BEGIN IF public.can_access_store('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1') THEN RAISE EXCEPTION 'inactive admin allowed'; END IF; END $$;
RESET ROLE;
UPDATE public.coverage_assignments SET valid_to=(now() at time zone 'Asia/Pontianak')::date-1 WHERE profile_id='22222222-2222-2222-2222-222222222222';
UPDATE public.store_assignments SET valid_to=(now() at time zone 'Asia/Pontianak')::date-1 WHERE manpower_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
DO $$ BEGIN IF public.can_access_store('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1') THEN RAISE EXCEPTION 'expired TL scope allowed'; END IF; END $$;
SELECT set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333331',false);
DO $$ BEGIN IF public.can_access_store('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1') THEN RAISE EXCEPTION 'expired EC scope allowed'; END IF; END $$;
RESET ROLE;
