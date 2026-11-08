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

TL and Admin open **Survey** to see KPI cards for total surveys, answers Ya/Tidak and multifinance units; provider- and model-breakdown bars; a detailed closing list; start/end date filter. **Unduh Dashboard XLSX** generates workbook sheets `Dashboard`, `Multifinance`, `Model`, `Harian`, and `Detail`. Workbook content is sanitized against spreadsheet formula injection. Dashboard figures reflect the current user's RLS coverage, and are not audited sales totals.

TL profiles RLS grants only own/admin profile reads, so a TL's Detail sheet may label EC ID as unavailable. This **does not** widen the TL's access to personal profiles; potential future enhancement: a restricted coverage-scoped EC metadata endpoint.

## Implementation

- `survey-affordability.js` — responsive EC questionnaire and TL/Admin report, provider/model breakdown, workbook export; uses user-scoped JWT REST requests on browsers whose Supabase JS session locks are unreliable.
- `index.html` — Survey menu routed by role; EC form vs TL/Admin dashboard.
- `docs/sql/20261108-affordability-survey-draft.sql` — new table, JSON validity function and RLS. **DRAFT ONLY, NOT APPLIED TO PRODUCTION**.
- `tests/affordability-survey.cjs` — branching, validation, lender list, summaries, SQL RLS structure, and Samsung RAW separation.

## Activation gate / security regression

1. Review migration by owner, including the `jsonb` validity function, store assignment on the survey date, unique constraint, management RLS and no UPDATE/DELETE access.
2. Run SQL first in an isolated database / test fixture, verify authenticated JWT paths: correct EC/day/store insert succeeds, wrong EC, wrong store, outdated date, fake provider, invalid quantities, duplicate responses, unconfirmed `Tidak` and anonymous all fail.
3. Verify TL covered store read succeeds and cross-coverage read denied; Admin can export all data; TSO is denied. Verify user-specific row restrictions under real JWT, not `SET ROLE` alone.
4. Obtain explicit production schema activation approval; apply migration through reviewed change control and verify RLS, API exposure and zero initial rows.
5. Only then merge/deploy frontend, observing Vercel free build quota. If frontend goes live before migration, it reports Survey unavailable and does not save deceptive data.
6. Submit a genuine EC daily survey (do not manufacture sales or survey data in production), validate TL/Admin report and Excel export, and monitor runtime/DB errors.

## Rollback

If a new issue occurs, disable Survey navigation or hide form, keep RLS ON, and leave submitted user records intact for audit. Revoke insert privilege temporarily only under approved security change; do not drop tables holding real responses without a verified recovery plan. The survey never mutates `raw_sellout`.

## Open business decisions

- Does reporting require respondent full names for TL? Currently coverage-safe survey data is available but existing `profiles` RLS may conceal respondent IDs from TL.
- Do ECs require correction/reopen of a submitted report? Current specification intentionally permits a single immutable survey per day and store.
- Payment amount and cross-checking against sellout imports are not requested and are intentionally excluded.
