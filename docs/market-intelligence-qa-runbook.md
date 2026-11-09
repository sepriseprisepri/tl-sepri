# Market Intelligence EC/TL — QA and Activation Runbook

## Design
- EC Focus Model must use per-EC allocations instead of full store targets; TL sees store-wide focus totals and valid achievements.
- EC allocation table: ec_focus_model_allocations, keyed by period, store, EC profile and model. TL may allocate via a coverage-scoped RPC, with server-validated upper caps against store Focus Model.
- Competitor edit/delete: own same-day rows only; deletion confirmation, audit before-image, no Samsung RAW modifications.
- Target Saya: round Qty only for display; Gap Qty = Target Qty - VALID MTD Qty; Gap Amt = Target Amt - VALID MTD Amt; Daily = ceil(max(0, Gap Qty)/remaining calendar days). Remaining days use Asia/Pontianak timezone.
- WoW: (week total / prior week total - 1) * 100. No percentage for zero baseline; current week is partial. Only VALID counts.
- Artificial Insight is deterministic, not predictive ML. Market feed is RSS headline-only from Samsung Newsroom and GSMArena; independent publisher links and official Indonesia price-page links carry provenance. No claim of automatic price sync for all smartphone brands.

## Release gates
1. Supabase connector unavailable: do not activate either database migration until access restored and staging/real-JWT RLS review succeeds.
2. Verify table constraints, unique Focus Model codes, TL recipients within coverage, store cap/over-allocation, current EC assignments, unauthorized TSO and other EC denial.
3. Verify competitor own same-day PATCH/DELETE accepted, yesterday/foreign rows rejected, date/store/owner unchanged, audit survives DELETE, Samsung raw counts unchanged.
4. Test Target Daily across month boundaries, partial weeks, missing data, empty models, all table search columns and filtered CSV.
5. Test mobile/laptop accessibility, news feed fallback, TLS/allowlisted source URL checks, and verified publication date.
6. Only merge and deploy once schema and tests are approved; Hobby plan free builds, no upgrade or surprise paid resource.

## Rollback
Keep RLS and recorded audits, disable UI writes and revoke competitor UPDATE/DELETE when reviewed. Do not delete submitted reports or Samsung RAW.