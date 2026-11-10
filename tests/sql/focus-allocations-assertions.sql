-- Tests for atomic authorized TL -> EC Focus Model allocation in isolated PG.
-- No production data, no production database access.
DO $a$
BEGIN
 IF has_table_privilege('anon','public.focus_model_ec_allocations','SELECT') THEN
  RAISE EXCEPTION 'anon may read private allocations'; END IF;
 IF has_table_privilege('authenticated','public.focus_model_ec_allocations','INSERT') OR
    has_table_privilege('authenticated','public.focus_model_ec_allocations','UPDATE') OR
    has_table_privilege('authenticated','public.focus_model_ec_allocations','DELETE') THEN
  RAISE EXCEPTION 'authenticated may bypass RPC'; END IF;
 IF has_function_privilege('anon',
  'public.set_focus_model_ec_allocation(uuid,uuid,text,uuid,numeric,numeric)','EXECUTE') THEN
  RAISE EXCEPTION 'anon can execute allocation RPC'; END IF;
END $a$;

-- TL 1 can manage ECs only in store S-01 and cannot exceed store model cap.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
SELECT public.set_focus_model_ec_allocation(
 'cccccccc-cccc-cccc-cccc-cccccccccccc',
 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','GALAXY A55',
 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',6,600);
SELECT public.set_focus_model_ec_allocation(
 'cccccccc-cccc-cccc-cccc-cccccccccccc',
 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','GALAXY A55',
 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',3,300);
DO $a$
DECLARE result text;
BEGIN
 IF (SELECT count(*) FROM public.focus_model_ec_allocations)<>2
 THEN RAISE EXCEPTION 'TL should see two allocations'; END IF;
 IF (SELECT sum(target_qty) FROM public.focus_model_ec_allocations)<>9
 THEN RAISE EXCEPTION 'Sum qty is wrong'; END IF;
 BEGIN
  PERFORM public.set_focus_model_ec_allocation(
   'cccccccc-cccc-cccc-cccc-cccccccccccc',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','GALAXY A55',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',5,500);
  RAISE EXCEPTION 'Over-allocated quantity accepted';
 EXCEPTION WHEN check_violation THEN
  NULL;
 END;
 BEGIN
  PERFORM public.set_focus_model_ec_allocation(
   'cccccccc-cccc-cccc-cccc-cccccccccccc',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','GALAXY A55',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',3,500);
  RAISE EXCEPTION 'Over-allocated amount accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 BEGIN
  PERFORM public.set_focus_model_ec_allocation(
   'cccccccc-cccc-cccc-cccc-cccccccccccc',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','GALAXY A55',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3',1,10);
  RAISE EXCEPTION 'Outside store EC accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
 IF (SELECT count(*) FROM public.focus_model_allocation_history)<>2
 THEN RAISE EXCEPTION 'Audit events missing'; END IF;
END $a$;
RESET ROLE;

-- TL 2 is assigned only to S-02 and must not modify S-01.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222223',false);
DO $a$ BEGIN
 BEGIN
  PERFORM public.set_focus_model_ec_allocation(
   'cccccccc-cccc-cccc-cccc-cccccccccccc',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','GALAXY A55',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',1,100);
  RAISE EXCEPTION 'Outside-coverage TL was accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 IF (SELECT count(*) FROM public.focus_model_ec_allocations)<>0
 THEN RAISE EXCEPTION 'TL can read another coverage'; END IF;
END $a$;
RESET ROLE;

-- EC can only see own, cannot allocate, and cannot read audit events.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333331',false);
DO $a$ BEGIN
 IF (SELECT count(*) FROM public.focus_model_ec_allocations)<>1
 THEN RAISE EXCEPTION 'EC sees other EC allocation'; END IF;
 IF (SELECT count(*) FROM public.focus_model_allocation_history)<>0
 THEN RAISE EXCEPTION 'EC sees TL audit history'; END IF;
 BEGIN
  PERFORM public.set_focus_model_ec_allocation(
   'cccccccc-cccc-cccc-cccc-cccccccccccc',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','GALAXY A55',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',7,700);
  RAISE EXCEPTION 'EC unexpectedly permitted to allocate';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $a$;
RESET ROLE;

-- Account rotation must deny access even if an old JWT remains valid.
UPDATE public.profiles SET must_change_password=true
 WHERE id='22222222-2222-2222-2222-222222222222';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
DO $a$ BEGIN
 IF (SELECT count(*) FROM public.focus_model_ec_allocations)<>0
 THEN RAISE EXCEPTION 'Rotating TL can still read EC allocations'; END IF;
 BEGIN
  PERFORM public.set_focus_model_ec_allocation(
   'cccccccc-cccc-cccc-cccc-cccccccccccc',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','GALAXY A55',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',8,800);
  RAISE EXCEPTION 'Rotating TL can allocate';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $a$;
RESET ROLE;
UPDATE public.profiles SET must_change_password=false
 WHERE id='22222222-2222-2222-2222-222222222222';

-- No parent target may be reduced below the sum of assigned EC targets.
DO $a$ BEGIN
 BEGIN
  UPDATE public.focus_model_targets SET target_qty=8
  WHERE store_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
  RAISE EXCEPTION 'Parent target was reduced below allocated Qty';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 BEGIN
  UPDATE public.focus_model_targets SET target_amt=800
  WHERE store_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
  RAISE EXCEPTION 'Parent amount was reduced below allocated Amt';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
END $a$;

-- Reissue/edit existing allocation is transactional; zero clears with audit.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
SELECT public.set_focus_model_ec_allocation(
 'cccccccc-cccc-cccc-cccc-cccccccccccc',
 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','GALAXY A55',
 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',5,500);
SELECT public.set_focus_model_ec_allocation(
 'cccccccc-cccc-cccc-cccc-cccccccccccc',
 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','GALAXY A55',
 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',0,0);
DO $a$ BEGIN
 IF (SELECT COALESCE(SUM(target_qty),0) FROM public.focus_model_ec_allocations)<>5
 THEN RAISE EXCEPTION 'Edit/delete did not recalculate allocation'; END IF;
 IF (SELECT count(*) FROM public.focus_model_allocation_history)<>4
 THEN RAISE EXCEPTION 'Audit missing edit or delete'; END IF;
END $a$;
RESET ROLE;

-- EC transferred to another store no longer sees obsolete old-store target.
UPDATE public.manpower SET site_id='S-02'
 WHERE id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333331',false);
DO $a$ BEGIN
 IF (SELECT count(*) FROM public.focus_model_ec_allocations)<>0
 THEN RAISE EXCEPTION 'Transferred EC still sees old-store allocation'; END IF;
END $a$;
RESET ROLE;
-- Even after the EC transfers to S-02, TL1 may remove the stale S-01
-- allocation without requiring the EC to be active at that old location.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
SELECT public.set_focus_model_ec_allocation(
 'cccccccc-cccc-cccc-cccc-cccccccccccc',
 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','GALAXY A55',
 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',0,0);
DO $a$ BEGIN
 IF (SELECT count(*) FROM public.focus_model_ec_allocations)<>0
 THEN RAISE EXCEPTION 'Transferred EC allocation could not be removed'; END IF;
 IF (SELECT count(*) FROM public.focus_model_allocation_history)<>5
 THEN RAISE EXCEPTION 'Transferred EC delete audit missing'; END IF;
END $a$;
RESET ROLE;
SELECT 'PASS: Focus Model allocation, TL coverage, EC visibility, audit, cap, rotation and transfer cleanup' AS result;
