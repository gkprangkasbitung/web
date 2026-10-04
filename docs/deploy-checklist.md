# Deploy checklist: Portal Jemaat and auth settings (stage 11f)

These are settings in the Supabase Dashboard and the hosting environment. The app never changes them from code. Do them before deploying stage 11f, in this order, on the **production** project.

For the first super_admin and the basic invite setup, see `docs/bootstrap-super-admin.md`. This page adds what the Portal Jemaat needs on top of it.

## 1. Database

- Push migration `0034_portal_jemaat.sql` together with the earlier unpushed ones (0018–0033).
- Without it, the Portal Jemaat fails closed: `auth_throttle` is missing, so every "Kirim kode masuk" answers "Tunggu 60 detik…" and no code is sent, and `/jemaat` greets people by email instead of by name.

## 2. Supabase → Authentication → Sign In / Providers

- **Allow new users to sign up: off.** Accounts only come from invites (Pengguna → Undang Pengguna). Invites keep working with sign-up off, because they go through the admin API.
- The app also sends `shouldCreateUser: false` on every code request, so an unknown email never gets an account even if this switch is turned on by mistake. The switch is the second layer, not the only one.
- **Email provider: on**, with **Confirm email** left as it is (invited accounts are confirmed by accepting the invite).

## 3. Supabase → Authentication → Emails

### Magic Link template (the sign-in code)

- Subject: `Kode masuk Portal Jemaat GKP Rangkasbitung`
- Body: copy `supabase/templates/magic-link.html`. It must contain `{{ .Token }}` (the 6-digit code). It has no link on purpose: the app signs in with the code only.

### Invite user template

- Subject (one line):
  `{{ if .Data.portal_jemaat }}Aktivasi Portal Jemaat GKP Rangkasbitung{{ else }}Undangan ke admin GKP Rangkasbitung{{ end }}`
- Body: copy `supabase/templates/invite.html`. It replaces the stage 10 version. The same template serves both kinds of invite:
  - an admin invite links to `{{ .SiteURL }}/auth/callback?next=/auth/set-password&…` ("Atur Password");
  - an "Akun Jemaat" invite links to `{{ .SiteURL }}/auth/callback?next=/jemaat&…` and needs no password.
- The `portal_jemaat` metadata flag only picks the wording and the landing page. Access is decided by the server from the account's roles and its jemaat link.

### Confirm signup template

- Not used: sign-up is off. Leave it as it is.

## 4. SMTP

- **Production must use your own SMTP** (Authentication → Emails → SMTP Settings): for example Resend, Postmark, Brevo, Amazon SES, or the domain's mail provider.
- Supabase's built-in sender is for development only: it sends only a handful of emails per hour, to team addresses only. With it, jemaat would often get no code at all.
- Use a sender address on the church's domain (for example `noreply@<domain>`) with SPF and DKIM set up at the domain's DNS, so codes don't land in Spam.
- After setting SMTP, raise **Rate Limits → Rate limit for sending emails** (see section 6).

## 5. Supabase → Authentication → URL Configuration

- **Site URL**: the site's public origin, the same value as the app's `SITE_URL` (for example `https://<domain>`).
- **Redirect URLs**: `https://<domain>/auth/callback**` must be in the list. The `**` matches both `?next=/auth/set-password` and `?next=/jemaat`.
- If there is a preview or staging domain that should accept invites, add its `/auth/callback**` too. Don't add wildcards for other domains.

## 6. Code lifetime and rate limits

Suggested values (Authentication → Sign In / Providers → Email, and Authentication → Rate Limits):

| Setting                                        | Suggested                    | Why                                                                                                                                                                                                     |
| ---------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Email OTP expiration                           | **600 seconds** (10 minutes) | The sign-in page and the email both say "Kode berlaku 10 menit". The default is 1 hour.                                                                                                                 |
| Email OTP length                               | **6**                        | The code field accepts exactly 6 digits.                                                                                                                                                                |
| Minimum interval between emails (per user)     | **60 seconds**               | Matches the page's "Kirim ulang" countdown. The app enforces the same limit itself, for every email alike.                                                                                              |
| Rate limit for sending emails (project-wide)   | **30–60 per hour**           | Enough for a Sunday rush once custom SMTP is on. Only adjustable with custom SMTP.                                                                                                                      |
| Rate limit for token verifications (per IP)    | **raise to 150 per 5 min**   | See the note on IPs below.                                                                                                                                                                              |
| Rate limit for sign-ups and sign-ins (per IP)  | **raise to 150 per 5 min**   | Same note. This also covers admin password logins and code requests.                                                                                                                                    |

**Note on IPs.** Every sign-in request reaches Supabase from the app server (the Server Actions run there), so Supabase sees the server's IP for every visitor. Its per-IP limits therefore count the whole congregation as one visitor. That is why the app keeps its own limits per visitor IP and per email (migration `0034`):

- sending a code: 1 per minute and 5 per hour per email, 20 per hour per IP;
- wrong codes: 5 per 15 minutes per email (then even the right code is refused until the window passes), 30 per 15 minutes per IP.

Raise Supabase's per-IP limits as above so they don't trip before the app's own limits. On Vercel the visitor IP comes from `x-forwarded-for`, which Vercel sets itself. Before moving to other hosting, read "Client IP (brief §7) and hosting" in `docs/progress.md` (stage 10).

## 7. Check it after deploying

1. Open `/portal`: both cards show, on a phone too.
2. Pengguna → Undang Pengguna → **Akun Jemaat**: pick a test jemaat and a test address you can read. The email's subject is "Aktivasi Portal Jemaat GKP Rangkasbitung"; its link lands on `/jemaat` with the jemaat's name, with no password step.
3. Keluar, then `/portal/masuk` with that address: a 6-digit code arrives within a minute. Enter it, and you're on `/jemaat`.
4. `/portal/masuk` with an address that has no account: the page says exactly the same "Jika email terdaftar, kode masuk telah dikirim." and no email arrives. Authentication → Users shows no new user.
5. Signed in as that jemaat account, open `/admin`: you land on `/portal` with the notice that the account has no access.
6. Log Aktivitas shows "Login ke Portal Jemaat" and "Logout dari Portal Jemaat" for the test account. Delete the test account afterwards (Pengguna → Hapus).
