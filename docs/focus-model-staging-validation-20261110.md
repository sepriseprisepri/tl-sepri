# Samsung Kalteng / TL SEPRI — Focus Model Staging Verification

**Status:** review-only, no permission to modify production. This checklist must be executed exclusively on a separately approved staging Supabase project after a verified backup and schema comparison.

## Dependencies and invariants

1. Confirm `target_periods`, `focus_model_settings(model_code UNIQUE)`, `focus_model_targets`, `manpower`, `store_assignments`, and `profiles` match the expected types.
2. Apply `docs/sql/20261110-focus-model-ec-allocations-draft.sql` to **staging only** after reviewing existing schema, roles and grants. The SQL includes RLS and private triggers.
3. EC can SELECT only personal `manpower_id` allocations. TL/Admin only scope they are authorized for. TSO may read scoped allocations, not write them.
4. All INSERT/UPDATE must satisfy two caps per `(period_id,store_id,model_code)`: `SUM(target_qty) <= focus_model_targets.target_qty` and `SUM(target_amt) <= focus_model_targets.target_amt`.
5. Identity `(period_id,manpower_id,store_id,model_code)` cannot be mutated. Parent target cannot be reduced below total allocated Qty/Amount.

## Test cases — use synthetic accounts and synthetic target rows

| Test | Expected |
| --- | --- |
| TL inserts 4 Qty into store/model target 10 Qty | Success |
| TL assigns another EC 6 Qty | Success, sum 10 |
| TL attempts third EC 1 Qty | Database check violation 23514, data unchanged |
| TL attempts 7 Qty for second EC | Violation 23514 |
| TL attempts Amount sum greater than parent target | Violation 23514 |
| EC attempts INSERT, UPDATE, DELETE | RLS/grant denied; no row changed |
| TL attempts cross-scope store or inactive EC | RLS denied |
| TL attempts to change row identity | UPDATE grant or trigger rejects |
| Admin reduces parent target under allocated total | Violation 23514 |
| Two TL sessions simultaneously allocate remaining 1 Qty | At most one succeeds; final sum never exceeds parent |
| Two TL sessions race UPDATE and INSERT | Final sum never exceeds parent |
| Force network retry of successful POST | Unique key prevents duplicate allocation |
| EC views Focus Model | Only own allocation and personal EULA VALID actual |
| TL views Focus Model | Scoped total target and valid achievement |

## Concurrent test procedure

Use **two separate authenticated database sessions** with different TL identities authorized for the same test store. The requests must start simultaneously using a transaction barrier or test harness. Because a client-side browser check is not a security boundary, validate outcomes by querying the final aggregate from a privileged staging-only test session. Repeat >= 20 times using rolled-back/isolated fixtures and alternate which session starts first. Verify the parent lock is held for the duration of the first transaction and the other transaction waits. Test at the default READ COMMITTED isolation level and separately review SERIALIZABLE behavior.

Do not execute these tests on production data, even if they appear to roll back.

## Competitor correction verification

Apply the separate same-day corrections draft to staging only. EC own sale on the current Asia/Pontianak date can edit allowed fields or delete the record. Dates from yesterday and foreign owner must not be mutable. Every successful edit/delete writes to `competitor_sellout_audit`. Confirm no direct API grants to audit and no changes to Samsung `raw_sellout`. Test at local midnight boundary.

## Rollback

Stop incoming staging writes, export staging allocations and their backup, drop the new triggers/functions and table according to SQL's rollback notes, re-run the original RLS and security tests. Preserve audit evidence. Do **not** drop anything from production.

## Release gates

- All above integration tests pass with real authenticated EC/TL accounts.
- Concurrent caps verified at database level, not merely static tests.
- Browser/mobile Focus Model form tested, including stale-data retry and clear error messages.
- Security advisors reviewed. A production backup/rollback owner and deployment window assigned.
- User approves production migration and merge/deploy separately.
