# Creating the first super_admin (production)

The production project starts with no users. The first `super_admin` can't be invited from the app, because inviting needs a `super_admin`. Create it once, by hand, with the steps below. Never put real credentials in the repo; keep them in a password manager.

`supabase/seed.sql` and its test accounts (`*@gkp.test`, password `password123`) exist only for the local stack. `supabase db push` doesn't run the seed. Never push with `--include-seed`.

## Before you start

Migrations `0001`–`0022` must already be on the production project.

## 1. Create the auth user

In the Supabase Dashboard, go to **Authentication → Users → Add user → Create new user**:

- Email: the administrator's real address.
- Password: a strong, unique password.
- Tick **Auto Confirm User**.

The `profiles` row is created automatically by the `on_auth_user_created` trigger.

Don't use "Send invitation" for this account yet. The invite email template and the `/auth/set-password` flow are finished in stage 10.

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

The SQL Editor runs as `postgres`, without a signed-in user. The guard that stops users from removing their own `roles:*` / `users:*` access (migration `0021`) only applies to signed-in users, so it doesn't block this step.

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

- Invite a second `super_admin` from Pengguna once stage 10 ships. Nobody can change their own role or remove their own `roles:*` / `users:*` access, so a second account is the normal way to fix the first. It is also the backup if one account is lost.
- If every `super_admin` account is ever lost, repeat step 2 for another user.
