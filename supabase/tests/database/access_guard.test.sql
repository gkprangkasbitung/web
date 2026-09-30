-- Brief §12.3: nobody can remove their own roles:* or users:* access, and a
-- user can't change their own role. Enforced in the database (0021 triggers
-- and set_user_role), so it holds for direct REST writes too.
begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres). Rolled back at the end.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('14000000-0000-4000-8000-000000000001', 'guard-superadmin-1@test.local'),
  ('14000000-0000-4000-8000-000000000002', 'guard-superadmin-2@test.local');

insert into public.user_roles (user_id, role_id)
select u.id, r.id
from (values ('14000000-0000-4000-8000-000000000001'::uuid), ('14000000-0000-4000-8000-000000000002'::uuid)) as u (id)
cross join public.roles r
where r.name = 'super_admin';

-- A second role that grants every roles:* and users:* permission.
insert into public.roles (id, name) values ('14000000-0000-4000-8000-0000000000e1', 'uji_cadangan');
insert into public.role_permissions (role_id, permission_id)
select '14000000-0000-4000-8000-0000000000e1', id from public.permissions where resource in ('roles', 'users');

-- ---------------------------------------------------------------------------
-- super_admin 1 acting on their own access
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"14000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

select throws_ok(
  $$ select public.set_user_role('14000000-0000-4000-8000-000000000001', (select id from public.roles where name = 'admin')) $$,
  '42501', 'Tidak bisa mengubah role akun sendiri.',
  'set_user_role refuses to change your own role'
);

select throws_ok(
  $$ select public.set_user_access('14000000-0000-4000-8000-000000000001', (select id from public.roles where name = 'admin'), null) $$,
  '42501', 'Tidak bisa mengubah role akun sendiri.',
  'set_user_access refuses to change your own role'
);

select lives_ok(
  $$ select public.set_user_role('14000000-0000-4000-8000-000000000001', (select id from public.roles where name = 'super_admin')) $$,
  'saving your own unchanged role is a no-op, not an error'
);

select throws_ok(
  $$ delete from public.user_roles where user_id = auth.uid() $$,
  '42501', 'Tidak bisa mencabut akses roles atau users milik akun sendiri.',
  'deleting your own super_admin assignment directly is refused'
);

select throws_ok(
  $$ update public.user_roles set role_id = (select id from public.roles where name = 'admin') where user_id = auth.uid() $$,
  '42501', 'Tidak bisa mencabut akses roles atau users milik akun sendiri.',
  'switching your own assignment to another role directly is refused'
);

select throws_ok(
  $$ delete from public.role_permissions
     where role_id = (select id from public.roles where name = 'super_admin')
       and permission_id = (select id from public.permissions where resource = 'users' and action = 'update') $$,
  '42501', 'Tidak bisa mencabut akses roles atau users milik akun sendiri.',
  'removing users:update from your own role directly is refused'
);

select throws_ok(
  $$ delete from public.role_permissions
     where role_id = (select id from public.roles where name = 'super_admin')
       and permission_id in (select id from public.permissions where resource = 'roles') $$,
  '42501', 'Tidak bisa mencabut akses roles atau users milik akun sendiri.',
  'removing every roles:* permission from your own role in one statement is refused'
);

select throws_ok(
  $$ select public.set_role_permissions(
       (select id from public.roles where name = 'super_admin'),
       array(select id from public.permissions where not (resource = 'roles' and action = 'delete'))
     ) $$,
  '42501', 'Tidak bisa mencabut akses roles atau users milik akun sendiri.',
  'set_role_permissions refuses to drop roles:delete from your own role'
);

select throws_ok(
  $$ delete from public.roles where name = 'super_admin' $$,
  '42501', 'Tidak bisa mencabut akses roles atau users milik akun sendiri.',
  'deleting a role you hold is refused'
);

select lives_ok(
  $$ select public.set_role_permissions(
       (select id from public.roles where name = 'super_admin'),
       array(select id from public.permissions where not (resource = 'warta' and action = 'delete'))
     ) $$,
  'permissions outside roles:* and users:* can still be removed from your own role'
);

select ok(
  public.has_permission('14000000-0000-4000-8000-000000000001', 'users', 'update')
    and public.has_permission('14000000-0000-4000-8000-000000000001', 'roles', 'delete')
    and exists (select 1 from public.roles where name = 'super_admin'),
  'after the refused attempts super_admin 1 still has full roles and users access'
);

-- ---------------------------------------------------------------------------
-- Another super_admin may change super_admin 1
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub":"14000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;

select lives_ok(
  $$ select public.set_user_role('14000000-0000-4000-8000-000000000001', (select id from public.roles where name = 'admin')) $$,
  'a second super_admin can change the first one''s role'
);

select results_eq(
  $$ select r.name from public.user_roles ur join public.roles r on r.id = ur.role_id
     where ur.user_id = '14000000-0000-4000-8000-000000000001' $$,
  $$ values ('admin') $$,
  'super_admin 1 is now admin'
);

-- ---------------------------------------------------------------------------
-- Without a signed-in user (SQL Editor, service role) the guard stands aside
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '';

-- The backup role, not super_admin: since 0028 the super_admin role's own
-- roles:* / users:* grants are locked on every path (users_roles.test.sql).
select lives_ok(
  $$ delete from public.role_permissions
     where role_id = '14000000-0000-4000-8000-0000000000e1'
       and permission_id = (select id from public.permissions where resource = 'users' and action = 'update') $$,
  'postgres without a user identity can still change role permissions'
);

-- Restore: the backup role grants every roles:* / users:* again, and
-- super_admin 1 holds super_admin and the backup role.
insert into public.role_permissions (role_id, permission_id)
select '14000000-0000-4000-8000-0000000000e1', p.id from public.permissions p
where p.resource = 'users' and p.action = 'update';
delete from public.user_roles where user_id = '14000000-0000-4000-8000-000000000001';
insert into public.user_roles (user_id, role_id)
select '14000000-0000-4000-8000-000000000001', id from public.roles where name in ('super_admin', 'uji_cadangan');

-- ---------------------------------------------------------------------------
-- Another role still granting the same access
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"14000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

select lives_ok(
  $$ delete from public.user_roles
     where user_id = auth.uid() and role_id = (select id from public.roles where name = 'super_admin') $$,
  'dropping your own role is allowed while another role still grants every roles:* and users:*'
);

select throws_ok(
  $$ delete from public.user_roles
     where user_id = auth.uid() and role_id = '14000000-0000-4000-8000-0000000000e1' $$,
  '42501', 'Tidak bisa mencabut akses roles atau users milik akun sendiri.',
  'but not the last role that grants them'
);

-- ---------------------------------------------------------------------------
-- The guard holds even where RLS does not apply (e.g. inside a SECURITY
-- DEFINER function) as long as a user is acting.
-- ---------------------------------------------------------------------------
reset role;

select throws_ok(
  $$ delete from public.permissions where resource = 'users' and action = 'update' $$,
  '42501', 'Tidak bisa mencabut akses roles atau users milik akun sendiri.',
  'deleting a permission you depend on is refused even with RLS bypassed'
);

select * from finish();
rollback;
