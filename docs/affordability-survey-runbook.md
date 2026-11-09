# Survey Affordability — EC daily workflow and TL/Admin export

## User requirements

EC answers **"Apakah ada unit sellout menggunakan multifinance?"** for the *survey date on the EC's assigned store*. The date is locked to today in Asia/Pontianak, matching the user's "hari yang sama" instruction.

- **Tidak** requires a separate explicit checkbox confirming no multifinance sellout on the same date and store, and an additional confirmation dialog before submission. No model or provider may be saved in this branch.
- **Ya** requires at least one closing row with model and variant (examples `A08 4/64`, `A57 12/256`), finance provider, and number of units (default 1). Multiple closes may be recorded, up to 25 rows per daily submission.
- Providers are **exactly**: HCI, KREDIVO, FIF, SPEKTRA, YESSSKREDIT, AKULAKU, SPAYLATER, INDODANA, SAMSUNG FINANCE+, KREDITPLUS, BAF, KARTU KREDIT BANK.
- One submitted response per EC, store, and day; duplicate submissions fail with a clear message. Submitted entries are immutable until a reviewed audited correction flow is implemented.
- Backend rejects any inconsistent `Ya` / `Tidak` payload, invalid lender, invalid model or unit count. Frontend validation is not the security boundary.
- Sales counts in reports are **self-reported survey units**, not a verified RAW Sellout transaction, and never modify official Samsung RAW Sellout or KPI.

## Read permissions and reporting

- EC: insert today's survey at an assigned store, see their own history only.
- TL: read surveys only for stores within their live coverage (via `can_access_store`).
- Admin: see all surveys.
- TSO: not enabled for affordability reports (not requested).
- Anonymous: no access. `authenticated` role has SELECT and INSERT but not UPDATE/DELETE; RLS further restricts the data.

TL and Admin open **Survey** to see KPI cards for total surveys, answers Ya/Tidak and multifinance units; provider- and model-breakdown bars; a detailed closing list; start/end date filter. **Unduh Dashboard XLSX** generates workbook sheets `Dashboard`, `Multifinance`, `Model`, `Harian`, and `Detail`. Workbook includes a sixth sheet **Respons Harian**, which preserves both **Ya** and **Tidak** (including confirmation) and the reporting EC ID. Workbook content is sanitized against spreadsheet formula injection. Dashboard figures reflect the current user's RLS coverage, and are not audited sales totals.

Each submitted survey stores the EC employee ID, verified against the caller's active EC profile and linked manpower in the INSERT RLS policy. TL sees employee IDs only on surveys already visible through store coverage RLS; no broader profile access is granted.

## Implementation

- `survey-affordability.js` — responsive EC questionnaire and TL/Admin report, provider/model breakdown, workbook export; uses user-scoped JWT REST requests on browsers whose Supabase JS session locks are unreliable.
- `index.html` — Survey menu routed by role; EC form vs TL/Admin dashboard.
- `docs/sql/20261108-affordability-survey-draft.sql` — new table, JSON validity function and RLS. Applied to Supabase production (migration `20261108063434_ec_affordability_survey_rls_20261108`) after user requested proceeding to the database activation stage.
- `docs/sql/20261108-affordability-employee-id-followup.sql` — applied follow-up migration for RLS-verified EC employee ID (the table was still empty).
- `tests/affordability-survey.cjs` — branching, validation, lender list, summaries, SQL RLS structure, and Samsung RAW separation.

## Activation gate / security regression

1. Review migration by owner, including the `jsonb` validity function, store assignment on the survey date, unique constraint, management RLS and no UPDATE/DELETE access.
2. Run SQL first in an isolated database / test fixture, verify authenticated JWT paths: correct EC/day/store insert succeeds, wrong EC, wrong store, outdated date, fake provider, invalid quantities, duplicate responses, unconfirmed `Tidak` and anonymous all fail.
3. Verify TL covered store read succeeds and cross-coverage read denied; Admin can export all data; TSO is denied. Verify user-specific row restrictions under real JWT, not `SET ROLE` alone.
4. **Production migration applied**, with 20/20 public tables under RLS, 3 Survey policies, anon denied, authenticated INSERT/SELECT only, and zero survey records. The RAW Sellout baseline remained 315 rows.
5. **Website deployment explicitly held by user** until free Vercel build capacity recovers. Keep PR #20 draft and separate from production main until free build and final regression readiness.
6. After deployment, submit a genuine EC daily survey (do not manufacture sales or survey data in production), validate TL/Admin report and Excel export, and monitor runtime/DB errors. Real JWT-role end-to-end tests remain outstanding.

## Rollback

If a new issue occurs, disable Survey navigation or hide form, keep RLS ON, and leave submitted user records intact for audit. Revoke insert privilege temporarily only under approved security change; do not drop tables holding real responses without a verified recovery plan. The survey never mutates `raw_sellout`. **No background deployment may be forced while the free build limit remains blocked.**

## Verification performed 2026-11-08

- Schema migration `20261108063434_ec_affordability_survey_rls_20261108` applied successfully; follow-up EC employee ID migration also applied.
- 20 of 20 public tables have RLS enabled; anonymous SELECT/INSERT denied, authenticated UPDATE/DELETE denied.
- JSON validation: valid HCI and Samsung Finance+ accepted; invalid provider, missing quantity, empty list, zero, decimals and quantity 101 rejected.
- Initial survey row count 0 and RAW Samsung 315 rows; no synthetic production sales were inserted.
- Supabase security advisors showed only six pre-existing warnings (five SECURITY DEFINER functions, leaked-password protection) and no new Survey-specific security finding.
- JWT-role end-to-end tests with actual EC/TL/Admin are still pending until frontend deployment.

## Open business decisions

- TL report exposes verified employee IDs on the survey records in covered stores. Full names are intentionally not exposed through expanded profile permissions.
- Do ECs require correction/reopen of a submitted report? Current specification intentionally permits a single immutable survey per day and store.
- Payment amount and cross-checking against sellout imports are not requested and are intentionally excluded.
