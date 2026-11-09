# Pusat Akun & Preferensi — Security & release checklist

## Menu & roles

- Admin, TL, TSO, EC: **Pengaturan** displays own `profiles` details (full name, Employee ID, role, active state), password change and display settings.
- EC additionally sees currently active assigned stores, using its own JWT and existing RLS restrictions. Other roles are intentionally not shown EC assignments.
- No Admin global-configuration control is introduced in this PR. EC account reset remains in the separate Admin-only menu.
- No changes to sales data, target allocations, survey records or database schema.

## Password change

- Users must be active, already past initial password rotation.
- Current password is checked against Supabase Auth via the signed-in user's real email (GET `/auth/v1/user`, then POST `/auth/v1/token?grant_type=password`).
- New password must have 14–128 characters, including a letter and digit, differ from the old password and match confirmation.
- On success, PUT `/auth/v1/user` with the freshly verified user's JWT. Secret/admin keys are never used.
- Clear all password inputs in `finally`. No passwords in logs, GitHub, localStorage or profile tables. UI recommends logout/relogin after change.
- Existing sessions may remain valid until expiry, so this is a self-service password update, **not** a forced global logout or breach-response mechanism.
- Live authenticated end-to-end test is required after website deployment; source tests do not simulate the Supabase Auth service.

## Appearance

- Theme (Gelap/Terang/Ikuti perangkat) stored under a per-user key in browser localStorage; local theme has no auth secrets. Theme is device-scoped, not synchronized between phones.
- Table density (Nyaman/Ringkas) persisted to existing `public.user_ui_preferences` via scoped JWT PostgREST. No new grants/privileges.
- Existing density toolbar and saved filters remain intact. Settings are accessible with touch-sized 48px form controls and mobile breakpoints.
- Light mode is a first pass of settings-theme styling. Verify contrast on mobile and desktop before declaring complete visual polish.

## Release gate

User requests **holding all Vercel deployments until the free build quota returns**. Keep changes in a draft PR and do not merge into main or trigger builds before the release gate. PR #20 (Survey Affordability) is separate and also waiting.

Suggested manual acceptance tests when release is possible: Admin/TL/TSO/EC show only their own profile and correct role; EC assigned store matches coverage; wrong current password rejects change; mismatched/weak password rejects; successful change followed by logout/relogin succeeds; density persists; theme retained on same device; mobile fields/taps work. Do not use real passwords in screenshots.
