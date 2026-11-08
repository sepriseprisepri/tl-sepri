# EC account provisioning — secure activation

As of 2026-11-08 the read-only Supabase audit found 33 active EC manpower records, 27 linked and active Auth/profile accounts, and 6 EC without Auth or profile. All 33 have active store assignments. Seven inactive personnel must stay inactive.

## Security rules

- Do not reset or replace the existing 27 EC credentials.
- Do not create accounts by editing auth.users directly with SQL.
- Only an active authenticated Admin may run activation. Authenticated EC may only rotate their own mandatory first-login temporary password.
- Use a strong distinct randomly generated password for each new EC. Provide it privately to that person after verifying identity. Never expose these credentials via public spreadsheet, GitHub, logs, or group chat.
- New profiles are inactive until their owner has rotated their temporary password. Existing profiles are never overwritten.
- No production database schema change is required.

## Activation steps

1. Admin signs into https://samsung-kalteng.vercel.app.
2. Admin opens Aktifasi Akun EC (menu label: Aktivasi Akun EC) and clicks Periksa ulang.
3. Expected preview: active_ec=33, already_linked=27, to_create=6.
4. Admin selects Buat akun yang belum ada, confirms, and saves each temporary password from the one-time display in a secure delivery workflow. Do not share with other EC.
5. Each newly created EC signs in using their own Employee ID and temporary password, changes it to a new personal password of 14+ characters containing letters and numbers, and signs in again.
6. Admin checks the post-activation report; users with errors must be reviewed individually.

## Verification SQL: read-only

    WITH e AS (
      SELECT m.is_active, p.id profile_id, p.is_active profile_active,
             p.must_change_password, u.id auth_id
      FROM public.manpower m
      LEFT JOIN public.profiles p ON p.manpower_id=m.id
      LEFT JOIN auth.users u ON u.id=p.id
      WHERE m.fieldforce_position='EC'
    )
    SELECT COUNT(*) FILTER (WHERE e.is_active) AS active_ec,
      COUNT(*) FILTER (WHERE e.is_active AND e.auth_id IS NOT NULL AND e.profile_active) AS activated_ec,
      COUNT(*) FILTER (WHERE e.is_active AND e.profile_id IS NULL) AS missing_profile,
      COUNT(*) FILTER (WHERE e.is_active AND e.auth_id IS NOT NULL
                     AND NOT e.profile_active AND e.must_change_password) AS rotation_pending
    FROM e;

After creation: expected activated_ec=27, missing_profile=0, rotation_pending=6.
After first sign-ins: expected activated_ec=33, missing_profile=0, rotation_pending=0.

## Rollback

If activation fails for any account, do not reset credentials of other EC. Re-check the individual mapping, disable/browse only the affected new Auth user, and restore its inactive profile before retrying with administrative verification. Do not weaken Row Level Security or repurpose sellout permissions.

## Limitations

The six accounts cannot be created by ChatGPT without an active Admin's authenticated session because this is a privileged identity-management action. Merging/deploying code alone does not create the Auth users. Do not claim a user can sign in until the signed-in Admin activation and first-login rotation actually succeed.
