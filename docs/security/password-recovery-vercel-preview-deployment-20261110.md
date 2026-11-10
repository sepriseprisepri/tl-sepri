# Deployment status — 10 Nov 2026

**Preview Vercel READY** (non-production): https://samsung-kalteng-b5awib89t-premierforus-7443s-projects.vercel.app
- Deployment ID `dpl_36wXZcpireqUH9MPfRQsdA1ZTCJF`
- Project `prj_8Q6nbPL2IpsFO8iX5IDT1xwgTKKM`, `samsung-kalteng`.
- Git SHA `c39b740604a16ad821227a0b2bd11e0248f3ac58`.
- No production-domain promotion and no Supabase production migration/function deployment.

## Blocked production rollout — missing credentials/controls

1. No genuine Cloudflare Turnstile sitekey configured for `samsung-kalteng.vercel.app`.
2. No Turnstile server secret configured for Supabase Edge Function; deployed handler **fails closed** without it. Available Supabase connector cannot set Edge Function secrets. Never deploy the dummy test secret.
3. Vercel project had no configured environment variables when inspected; browser recovery module reads `window.SAMSUNG_TURNSTILE_SITE_KEY` and explicitly errors if missing.
4. Gateway-wide anti-abuse control across many distinct employee IDs is required in addition to CAPTCHA + atomically rate limited per employee fingerprint.
5. Full schema-only test and broad `anon` grants / SECURITY DEFINER audit require sign-off.
6. 30 real user resets are excluded from scope; each credential operation requires separate approval.

## Minimal owner actions to unblock

- Create Turnstile widget in Cloudflare for `samsung-kalteng.vercel.app` (and any officially used custom domains). Retain sitekey for client configuration and add secret using the Supabase dashboard's **Edge Function secrets** panel. **Do not paste the secret into chat or GitHub.**
- Configure the sitekey in frontend build/runtime safely; with static HTML use a reviewed public config file (never embed the private secret).
- Deploy Supabase migration, restricted RLS/RPC patches and both Edge Functions only after security gate tests and backup/rollback check. Confirm the live endpoint responds generically to unknown account and rejects unauthorized admin actions.
- Deploy Vercel production last; verify original dashboard and recovery links work. Keep a tested rollback for frontend and Edge Functions.
- Do not merge/promote solely because Vercel preview is READY.

## CI evidence

- Postgres production-body Master Database RPC successful dummy import: https://github.com/sepriseprisepri/tl-sepri/actions/runs/42821182687
- Full local Supabase Auth/Edge including 2 Admin approval race: https://github.com/sepriseprisepri/tl-sepri/actions/runs/42821182761
- Operational smoke: https://github.com/sepriseprisepri/tl-sepri/actions/runs/42821182703

**Release decision: PREVIEW DEPLOYED; PRODUCTION BLOCKED until real key provisioning and security sign-off.**
