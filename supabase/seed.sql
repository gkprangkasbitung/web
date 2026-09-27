-- LOCAL DEVELOPMENT ONLY. Applied by `supabase start` / `supabase db reset`
-- on the local stack; never push this to the production project.
--
-- One test account per seeded role plus one without any role, all with the
-- password "password123":
--   superadmin@gkp.test  super_admin
--   admin@gkp.test       admin
--   editor@gkp.test      editor
--   viewer@gkp.test      viewer
--   tanpa-role@gkp.test  (no role)

with accounts (id, email, full_name, role_name) as (
  values
    ('00000000-0000-4000-8000-000000000001'::uuid, 'superadmin@gkp.test', 'Super Admin Lokal', 'super_admin'),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'admin@gkp.test', 'Admin Lokal', 'admin'),
    ('00000000-0000-4000-8000-000000000003'::uuid, 'editor@gkp.test', 'Editor Lokal', 'editor'),
    ('00000000-0000-4000-8000-000000000004'::uuid, 'viewer@gkp.test', 'Viewer Lokal', 'viewer'),
    ('00000000-0000-4000-8000-000000000005'::uuid, 'tanpa-role@gkp.test', null, null)
),
new_users as (
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, reauthentication_token
  )
  select
    '00000000-0000-0000-0000-000000000000', a.id, 'authenticated', 'authenticated', a.email,
    extensions.crypt('password123', extensions.gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    case when a.full_name is null then '{}'::jsonb else jsonb_build_object('full_name', a.full_name) end,
    now(), now(), '', '', '', '', '', ''
  from accounts a
  returning id, email
)
insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now()
from new_users u;

insert into public.user_roles (user_id, role_id)
select a.id, r.id
from (
  values
    ('00000000-0000-4000-8000-000000000001'::uuid, 'super_admin'),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'admin'),
    ('00000000-0000-4000-8000-000000000003'::uuid, 'editor'),
    ('00000000-0000-4000-8000-000000000004'::uuid, 'viewer')
) as a (id, role_name)
join public.roles r on r.name = a.role_name;
