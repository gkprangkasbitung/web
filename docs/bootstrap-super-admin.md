# Creating the first super_admin (production)

The production project starts with no users. The first `super_admin` can't be invited from the app, because inviting needs a `super_admin`. Create it once, by hand, with the steps below. Never put real credentials in the repo; keep them in a password manager.

`supabase/seed.sql` and its test accounts (`*@gkp.test`, password `password123`) exist only for the local stack. `supabase db push` doesn't run the seed. Never push with `--include-seed`.

## Before you start

Migrations `0001`–`0028` must already be on the production project.

## 1. Create the auth user

In the Supabase Dashboard, go to **Authentication → Users → Add user → Create new user**:

- Email: the administrator's real address.
- Password: a strong, unique password.
- Tick **Auto Confirm User**.

The `profiles` row is created automatically by the `on_auth_user_created` trigger.

Don't use "Send invitation" for this first account: create it with a password as above. Everyone after it is invited from Pengguna (see "Invites" below).

## 2. Assign the role

Run the following in the **SQL Editor**. Replace `<EMAIL>` with the address from step 1.

```sql
insert into public.user_roles (user_id, role_id)
select u.id, r.id
from auth.users u
join public.roles r on r.name = 'super_admin'
where u.email = '<EMAIL>'
on conflict do nothing;
```

It must report `INSERT 0 1`. `INSERT 0 0` means the email didn't match any user; check it for typos.

Optionally, set the name shown in the app:

```sql
update public.profiles set full_name = '<NAMA LENGKAP>' where email = '<EMAIL>';
```

The SQL Editor runs as `postgres`, without a signed-in user. The guard that stops users from removing their own `roles:*` / `users:*` access (migration `0021`) only applies to signed-in users, so it doesn't block this step. The super_admin guards from `0028` only refuse *removing* access, never adding it.

## 3. Verify

```sql
select u.email, r.name as role
from public.user_roles ur
join auth.users u on u.id = ur.user_id
join public.roles r on r.id = ur.role_id
where u.email = '<EMAIL>';
```

Expect exactly one row, with role `super_admin`.

Then sign in at `/login`. The account menu shows the role `super_admin`, and the sidebar includes Pengguna, Roles & Permissions, and Log Aktivitas.

## 4. Afterwards

- Invite a second `super_admin` from Pengguna. Nobody can change their own role or remove their own `roles:*` / `users:*` access, so a second account is the normal way to fix the first. It is also the backup if one account is lost.
- If every `super_admin` account is ever lost, repeat step 2 for another user.

## Invites (set up once, before the first invite)

Invites are sent by the app (`auth.admin.inviteUserByEmail`). Three settings must agree:

1. **App environment** (Vercel → Project → Settings → Environment Variables): `SITE_URL` = the site's public origin, for example `https://<domain>` (no path, no trailing slash, https). It is server-only. If it is missing or invalid, "Kirim Undangan" fails with a server error instead of guessing the address from the request.
2. **Supabase → Authentication → URL Configuration**
   - **Site URL**: the same origin as `SITE_URL`.
   - **Redirect URLs**: add `https://<domain>/auth/callback**`. The `**` makes the `?next=/auth/set-password` query match.
3. **Supabase → Authentication → Emails → Invite user**: use the template in `supabase/templates/invite.html` (subject "Undangan ke admin GKP Rangkasbitung"). Its link is
   `{{ .SiteURL }}/auth/callback?next=/auth/set-password&token_hash={{ .TokenHash }}&type=invite`.
   It is built from the Site URL, so the link's domain comes from this setting, never from a request.

Check it: invite a test address, open the email, and follow the link. It should land on "Atur Password", and after saving, on `/admin` with the role you chose.

Supabase's built-in email sender is heavily rate-limited (a few emails per hour). For regular use, configure custom SMTP under Authentication → Emails → SMTP Settings.

## Repairing access by hand (migration `0028`)

Since `0028`, the database always keeps at least one `super_admin`:

- the last `super_admin` assignment can't be removed, and the last `super_admin` account can't be deleted (not even from the Supabase dashboard or the SQL Editor);
- the `super_admin` role can't be deleted or renamed;
- its `roles:*` and `users:*` permissions can't be removed.

The normal fix is always to add first: give another account `super_admin` (step 2), then change or remove the old one. Only if you truly must remove the last one (for example, handing the project over), do it in one transaction in the SQL Editor, re-enabling the trigger before commit:

```sql
begin;
alter table public.user_roles disable trigger guard_super_admin;
-- the change, for example:
-- delete from public.user_roles where user_id = '<USER_ID>';
alter table public.user_roles enable trigger guard_super_admin;
commit;
```

The triggers on `public.roles` and `public.role_permissions` are also named `guard_super_admin`. `activity_logs` is append-only for every role, including the SQL Editor; its triggers are `guard_activity_log_immutable` and `guard_activity_log_truncate`.
