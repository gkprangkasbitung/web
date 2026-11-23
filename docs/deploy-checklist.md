# Deploy checklist: Portal Jemaat and auth settings (stages 11f, 13a, 14a, 14d; jemaat login switched to email + password, follow-up)

These are settings in the Supabase Dashboard and the hosting environment. The app never changes them from code. Do them before deploying stage 11f, in this order, on the **production** project.

For the first super_admin and the basic invite setup, see `docs/bootstrap-super-admin.md`. This page adds what the Portal Jemaat needs on top of it.

## 1. Database

- Push migration `0034_portal_jemaat.sql` together with the earlier unpushed ones (0018–0033). (The `auth_throttle` function it adds is no longer called by the app — it was for the email sign-in code, removed in favor of email + password below — but the migration stays as-is; nothing depends on removing it.)

## 2. Supabase → Authentication → Sign In / Providers

- **Allow new users to sign up: off.** Accounts only come from invites (Pengguna → Undang Pengguna). Invites keep working with sign-up off, because they go through the admin API.
- **Email provider: on**, with **Confirm email** left as it is (invited accounts are confirmed by accepting the invite).

## 3. Supabase → Authentication → Emails

### Invite user template

- Subject (one line):
  `{{ if .Data.portal_jemaat }}Aktivasi Portal Jemaat GKP Rangkasbitung{{ else }}Undangan ke admin GKP Rangkasbitung{{ end }}`
- Body: copy `supabase/templates/invite.html`. The same template serves both kinds of invite, and both now land on "Atur Password":
  - an admin invite links to `{{ .SiteURL }}/auth/callback?next=/auth/set-password&…`;
  - an "Akun Jemaat" invite links to `{{ .SiteURL }}/auth/callback?next=/auth/set-password&portal=jemaat&…` — the `portal=jemaat` hint is only so an *expired or reused* link still lands back on `/portal/masuk` instead of `/login`.
- The `portal_jemaat` metadata flag only picks the wording. Access is decided by the server from the account's roles and its jemaat link.

### Magic Link / Confirm signup templates

- Not used: sign-up is off, and jemaat sign-in is email + password (no email code). Leave them as they are.

## 4. SMTP

- **Production must use your own SMTP** (Authentication → Emails → SMTP Settings): for example Resend, Postmark, Brevo, Amazon SES, or the domain's mail provider.
- Supabase's built-in sender is for development only: it sends only a handful of emails per hour, to team addresses only. With it, an invited jemaat might not get their activation email at all.
- Use a sender address on the church's domain (for example `noreply@<domain>`) with SPF and DKIM set up at the domain's DNS, so invites don't land in Spam.

## 5. Supabase → Authentication → URL Configuration

- **Site URL**: the site's public origin, the same value as the app's `SITE_URL` (for example `https://<domain>`).
- **Redirect URLs**: `https://<domain>/auth/callback**` must be in the list. The `**` matches `?next=/auth/set-password` with or without `&portal=jemaat`.
- If there is a preview or staging domain that should accept invites, add its `/auth/callback**` too. Don't add wildcards for other domains.

## 6. Rate limits

Since stage 14d, `/portal/masuk` (both tabs) has its own wrong-password limits, in the database (`auth_throttle`, buckets `login_fail_akun` and `login_fail_ip`, migration 0039): 5 wrong passwords per account per 15 minutes locks that account for up to 15 minutes, and 30 per IP per 15 minutes. The admin's `/login` still has none of its own.

Supabase sees every sign-in as coming from the app server's IP (Server Actions), so its own per-IP limit counts the whole congregation as one visitor. In Authentication → Rate Limits, raise **sign-ins and sign-ups** (default 30 per 5 minutes per IP) and **token refreshes** (default 150 per 5 minutes per IP, refreshed by the app server too) well above their defaults before the first username accounts are handed out, for example to 300 and 1500; the app's per-account and per-IP limits are the real protection against guessing. On Vercel the visitor IP comes from `x-forwarded-for`, which Vercel sets itself. Before moving to other hosting, read "Client IP (brief §7) and hosting" in `docs/progress.md` (stage 10).

## 7. Check it after deploying

1. Open `/portal`: both cards show, on a phone too.
2. Pengguna → Undang Pengguna → **Akun Jemaat**: pick a test jemaat and a test address you can read. The email's subject is "Aktivasi Portal Jemaat GKP Rangkasbitung"; its link lands on "Atur Password", and setting one lands on `/jemaat` with the jemaat's name.
3. Keluar, then `/portal/masuk` with that address and the password just set: you're on `/jemaat`.
4. `/portal/masuk` with a wrong password, or with an address that has no account: both say "Email atau password salah." (no enumeration).
5. Signed in as that jemaat account, open `/admin`: you land on `/portal` with the notice that the account has no access.
6. Log Aktivitas shows "Login ke Portal Jemaat" and "Logout dari Portal Jemaat" for the test account. Delete the test account afterwards (Pengguna → Hapus).

## 8. Portal Jemaat data (stage 13a)

- Push migration `0037_portal_jemaat_data.sql` together with the earlier unpushed ones (0018–0036).
- **Supabase → Project Settings → Data API → Exposed schemas: add `portal`.** Keep `public` and `graphql_public`, and never add `private`. Without `portal`, every portal call answers `PGRST106` ("The schema must be one of the following…"), and the /jemaat pages (stage 13b) load nothing. Local development has it in `supabase/config.toml` (`[api] schemas`).
- Exposing the schema grants nothing by itself: anon has no usage on `portal`, and `authenticated` may execute only the nine portal functions, not the internal `_jemaat_id_saya`.
- "Hapus akun login" (§17.4) deletes the jemaat's auth user with `SUPABASE_SERVICE_ROLE_KEY`. It must be set as a server-only variable in the hosting environment (already needed for invites since stage 10).
- The new setting `profil_gereja.portal_tampilkan_persembahan` starts off. Turn it on only when the church has decided jemaat may see their own Persembahan Bulanan.

Check it after deploying:

1. With the anon key: `POST {SUPABASE_URL}/rest/v1/rpc/profil_saya` with the headers `apikey: <anon key>` and `Content-Profile: portal` → 401 with `"code":"42501"` ("permission denied for schema portal").
2. The same call with the access token of a staff account that has no jemaat link (`Authorization: Bearer <token>`) → 403 with `"code":"PT403"` ("Akun ini belum terhubung ke data jemaat.").
3. The same call with a jemaat account's token → 200 with only that jemaat's own row.

## 9. Pemilihan Majelis Jemaat (stage 14a)

- Push migration `0038_pemilihan.sql` together with the earlier unpushed ones (0018–0037). It adds the role `panitia_pemilihan` and the permissions `pemilihan:*`, `pemilihan_hasil:read`, `pemilihan_bantu:create` (granted to super_admin and panitia_pemilihan only). No new exposed schema: the portal functions live in `portal` (§8).
- The secret ballot relies on these Postgres settings (Supabase → Project Settings → Database, or `show …` in the SQL Editor). Check them before the election opens and **don't change them until the results are announced**; `docs/pemilihan-kerahasiaan.md` explains why:
  - `log_statement` is `ddl` or `none` (never `mod` or `all`), and `log_min_duration_statement` is `-1`;
  - `log_parameter_max_length_on_error` is `0`;
  - `pgaudit.log` is `none` (no `write`/`function`/`all`);
  - the `authenticated` role's `statement_timeout` (8s) stays below `auto_explain.log_min_duration` (10s): `auto_explain` logs a slow query **with its parameters**, which for a vote are the choices;
  - `track_commit_timestamp` stays `off`.
- Keep the people with access to the Supabase project (dashboard, SQL Editor, backups) to a known few during the election: direct database access can match votes to voters (`docs/pemilihan-kerahasiaan.md`, "Batasan").
- Don't add `pemilihan_suara` or `pemilihan_partisipasi` to a Realtime publication.

Check it after deploying:

1. With a super_admin's access token: `GET {SUPABASE_URL}/rest/v1/pemilihan_suara?select=*` and `…/pemilihan_partisipasi?select=*` → 403 with `"code":"42501"`. The same with the service-role key → `42501` too.
2. `GET {SUPABASE_URL}/rest/v1/pemilihan_kontes?select=*&order=urutan` with any signed-in token → Penatua 10–30, PPJ 5–15.
3. With a viewer's token: `POST {SUPABASE_URL}/rest/v1/rpc/hasil_suara` with `{"p_pemilihan_id": "<any uuid>"}` → 403 with `"code":"42501"`.

## 10. Portal Jemaat username accounts (stage 14d)

- Push migration `0039_portal_username.sql` together with the earlier unpushed ones (0018–0038). It enables the `citext` extension (schema `extensions`), adds `profiles.username` and `profiles.wajib_ganti_password`, a second `auth.users` trigger (`on_auth_user_created_portal`), and the RPCs `siapkan_reset_password` and `selesai_ganti_password_sementara`.
- **Set `PORTAL_LOGIN_DOMAIN`** (server-only) in the hosting environment, for production and every preview: a subdomain the church controls that has **no mailbox**, for example `masuk.gkprangkasbitung.org`. Username accounts get the auth email `{username}@{PORTAL_LOGIN_DOMAIN}`. The server refuses to start without a valid value (every page then answers 500, and the log names the variable).
  - Don't change it once accounts exist: the stored auth emails keep the old domain, and username login would stop finding them.
  - Make sure no mail server accepts mail for it (no MX record), so nothing is ever delivered there. Supabase doesn't send mail to these accounts (they are created already confirmed), and there is no "forgot password" for jemaat.
- Rate limits: see §6.

Check it after deploying:

1. Pengguna → **Buat Akun Username**: pick one test jemaat, keep the suggested username, create. The password table shows once; **Cetak Slip** prints only the slip.
2. Keluar, then `/portal/masuk` (the "Username & password" tab is selected): the username and the slip's password land on "Buat Password Baru". Any `/jemaat/...` address you type brings you back there. After a new password: `/jemaat`, and Akun Saya shows the username, never the `@{PORTAL_LOGIN_DOMAIN}` address.
3. `/portal/masuk` with that username and a wrong password, and with a username that doesn't exist: both say "Username atau password salah.". Five wrong passwords in a row, then the right one: "Terlalu banyak percobaan masuk. Coba lagi dalam 15 menit."
4. Pengguna → the test account → **Reset Password**: a new temporary password shows once; the old one no longer works, and the next login asks for a new password again.
5. Log Aktivitas shows "Membuat akun username …", "Login ke Portal Jemaat", "Mengganti password sementara", "Mereset password akun …", and no password anywhere. Delete the test account afterwards.
