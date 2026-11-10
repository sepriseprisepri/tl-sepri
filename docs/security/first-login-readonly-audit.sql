-- READ ONLY: re-audit eligible first-login password-recovery candidates.
-- Run manually with reviewer approval; NO password values, email, access tokens or secret keys returned.
-- This SELECT is informational only and NEVER resets an account.
WITH allowed(employee_id, intended_role) AS (
 VALUES
 ('005065','tl'),('032914','tl'),('053456','tl'),('063383','tl'),
 ('037299','ec'),('039876','ec'),('041975','ec'),('051305','ec'),
 ('061634','ec'),('063978','ec'),('065152','ec'),('065246','ec'),
 ('067850','ec'),('068065','ec'),('068263','ec'),('069549','ec'),
 ('069890','ec'),('070432','ec'),('071318','ec'),('071402','ec'),
 ('072524','ec'),('074436','ec'),('074888','ec'),('075565','ec'),
 ('075740','ec'),('076194','ec'),('076462','ec'),('076519','ec'),
 ('076531','ec'),('076533','ec')
)
SELECT a.employee_id, a.intended_role,
       CASE
        WHEN p.id IS NULL THEN 'MISSING_PROFILE'
        WHEN p.role <> a.intended_role THEN 'ROLE_CHANGED'
        WHEN p.is_active IS DISTINCT FROM TRUE THEN 'PROFILE_INACTIVE'
        WHEN p.must_change_password IS TRUE THEN 'ALREADY_ROTATION_REQUIRED'
        WHEN p.manpower_id IS NULL OR m.id IS NULL THEN 'MISSING_MANPOWER'
        WHEN m.is_active IS DISTINCT FROM TRUE THEN 'MANPOWER_INACTIVE'
        WHEN u.id IS NULL THEN 'MISSING_AUTH'
        WHEN lower(u.email) <> lower(p.employee_id || '@login.tlsepri.internal') THEN 'AUTH_EMAIL_MISMATCH'
        WHEN u.last_sign_in_at IS NOT NULL THEN 'ALREADY_SIGNED_IN'
        WHEN u.email_confirmed_at IS NULL THEN 'AUTH_UNCONFIRMED'
        WHEN u.deleted_at IS NOT NULL THEN 'AUTH_DELETED'
        WHEN u.banned_until > now() THEN 'AUTH_BANNED'
        ELSE 'ELIGIBLE_FOR_REVIEW'
       END AS status
FROM allowed a
LEFT JOIN public.profiles p ON p.employee_id=a.employee_id
LEFT JOIN public.manpower m ON m.id=p.manpower_id
LEFT JOIN auth.users u ON u.id=p.id
ORDER BY a.intended_role DESC, a.employee_id;
-- Expected base audit: 30 eligible IDs as of 2026-11-10.
-- Any other status means STOP and investigate before seeking final authorization.
