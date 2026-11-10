# Supabase Auth + Edge Function E2E — Real Local Stack (2026-11-10)

**Environment:** disposable Supabase CLI local stack in GitHub Actions (GoTrue, PostgREST, PostgreSQL and Edge runtime). **No hosted Supabase production changes, no paid resources, no real user IDs/passwords.**

## Successful proof

**Latest full-stack job including TL, EC, and stalled Admin recovery:** https://github.com/sepriseprisepri/tl-sepri/actions/runs/42753014797 — PASS on commit `a1818c42d662337c73d3c721f61e8f0e379a91bf`.
**Previous TL-only end-to-end job:** https://github.com/sepriseprisepri/tl-sepri/actions/runs/42752354411 — PASS.
**PostgreSQL RLS/concurrency:** https://github.com/sepriseprisepri/tl-sepri/actions/runs/42752354420 — PASS.
**Static/mock handler and injected Auth failure:** GitHub Actions `Samsung Kalteng Operational Smoke` on the latest branch, with `tests/password-recovery-mock-integration.cjs`.

### Verified cases (genuine local Supabase services)

| Scenario | Status |
|---|---|
| Create dummy users with Supabase Admin Auth API | PASS |
| Login Admin/TL/EC with GoTrue username/password | PASS |
| Read dummy market data with active TL and EC tokens | PASS |
| Anonymous request validated using **official Cloudflare Turnstile test credentials** (hostname `example.com` allowed ONLY on localhost with official dummy secret) | PASS |
| Unknown ID returns generic response | PASS |
| Admin lists request queue and approves reset | PASS |
| TL cannot approve reset | PASS |
| Auth password is changed to a unique temporary password | PASS |
| Previously issued JWT cannot read protected local business rows during recovery | PASS |
| User can sign in using temporary password but cannot read business data before rotation | PASS |
| Expired request is rejected by rotation HTTP 410 | PASS |
| Admin reissues a fresh temporary password | PASS |
| User changes password and logs in again with new password | PASS |
| TL market data access returns only after completing rotation | PASS |
| EC request -> approval -> temporary login -> blocked data -> rotation -> restored access | PASS |
| Fresh processing request cannot be reissued before 15 minutes | PASS: HTTP 409 |
| Admin can reissue stalled processing request older than 15 minutes | PASS: renewed temporary password and completed EC rotation |
| Synthetic Auth password update failure | PASS: no temporary secret returned; account remains locked and reissue possible |

### Tests and relevant files

- `.github/workflows/recovery-fullstack-local.yml`: starts/stops Supabase local in CI; no remote refs, no cloud credentials.
- `tests/sql/recovery-supabase-local-fixture.sql`: local-only profiles/business data, uses **real auth.users created by GoTrue**.
- `tests/recovery-supabase-local-e2e.cjs`: real HTTP calls to Auth API, Edge Function and PostgREST; **hard-fails for any URL outside localhost:54321**.
- `tests/password-recovery-mock-integration.cjs`: mocked failure injection and no-secret-on-error assertions.
- `docs/sql/20261110-password-recovery-approval-draft.sql`: queue and atomic rate limiting draft.
- `docs/sql/20261110-password-recovery-rls-guard-staging.sql`: mandatory-password-change role gate draft.

## Important remaining production release blockers

1. Real local RLS test protects **dummy business table**, not every Samsung Kalteng production table, RPC, view, storage bucket, and role. Complete coverage matrix is required.
2. Ingress fingerprint currently reads `x-forwarded-for` without trusted proxy normalization; distributed abuse is not fully addressed.
3. Cloudflare Turnstile real domain-specific sitekey/secret, allowed production hostname and client CSP have **not** been configured. Dummy test secret MUST NOT be deployed.
4. Stalled `processing` requests now have a 15-minute timeout and conditional timestamp claim, tested against Supabase local. **Still required:** concurrency test with two simultaneous Admin approvals/reissues under load, plus monitoring/alerting for stuck requests.
5. Multi-admin contention and failure after successful Auth update but failed PostgREST status update require operational playbooks and potentially transaction/outbox patterns. No plaintext temporary passwords may ever be persisted in logs or database.
6. Admin should authenticate recipient identity out of band, deliver secret via private channel, and record the acknowledgement without exposing it in a shared table.
7. Regression test real production SQL definitions against isolated restored **schema-only** snapshot; no customer data or authentication secrets.
8. Separate security review + explicit final production approval required before applying migration/deploying Edge Function/merging PR/resetting real credentials.

**Release judgment:** Strong progress: Auth + Edge + PostgREST integration has passed for dummy TL/EC on a disposable local stack. **Still NO-GO for production** until above blockers are closed.
