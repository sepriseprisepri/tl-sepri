# Reset Password EC — Admin only

## Purpose and role policy

The user approved adding **Reset Password EC**, not mass resetting all 33 passwords. Reset only one verified person's account per action. Existing EC passwords are not viewable or retrievable, and they must not be replaced with the shared guess "Samsung123456".

The backend `supabase/functions/provision-ec-accounts/index.ts` implements two new actions:
- `list_ec_accounts` — lists active EC accounts to an authenticated active Admin without passwords.
- `reset_password` — accepts one exact `employee_id` for an active EC; verifies its manpower/profile/Auth linkage before making changes. Only an active authenticated Admin can call it.

An EC's identity is resolved from the master data on the server, not from user-supplied target UUID, name or email. Reset generates a strong cryptographically random temporary password, marks the selected EC profile inactive with `must_change_password=true`, then updates that user's Supabase Auth password. If the Auth update fails the user remains inactive and the Admin must retry. No existing account other than the selected account is modified.

## Admin procedure

1. Open https://samsung-kalteng.vercel.app and sign in with Admin credentials.
2. Navigate to **Aktivasi Akun EC** and the **Reset Password EC** panel.
3. Search the EC, select the correct employee, verify their identity through an authorized private channel, then type their Employee ID again.
4. Confirm the reset. The temporary password appears one time; share it privately with the verified EC.
5. The EC signs in with their Employee ID and temporary password, changes it to a personal password of at least 14 characters with letters and numbers, then logs in again.
6. If reset fails, do not assume the password was changed. Use individual Admin review and retry; **do not reset all EC passwords**.

## Security gates and limitations

- No password is written to the database by SQL, logged, committed to GitHub, or sent in ChatGPT.
- The web UI clears password text on request or when navigating away. Clipboard content copied manually remains under Admin's control.
- Caller authorization and target identity checks are enforced server-side.
- No mass reset endpoint exists.
- An inactive profile denies `public.current_app_role()`; Supabase Auth session lifetime cannot be guaranteed to end immediately merely from a password change.
- Production credentials are not reset during deployment. A real Admin must initiate the action while authenticated; live end-to-end reset still needs verification with an actual authorized test account.
- The pre-existing six EC accounts awaiting first-login password rotation can also be individually reset by Admin if their one-time temporary passwords were lost.
