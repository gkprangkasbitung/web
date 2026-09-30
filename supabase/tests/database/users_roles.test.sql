-- Stage 10 (0028): there is always a super_admin, the super_admin role can't
-- be deleted, renamed, or stripped of roles:* / users:*, and the permission
-- editor's save never touches the hidden announcements/content grants. Also
-- deleting an account that created a warta keeps the warta (created_by null).
begin;
create extension if not exists pgtap with schema extensions;

select plan(29);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres). Rolled back at the end.
--   A  the only super_admin (every other super_admin assignment is removed)
--   B  a custom role with every roles:* and users:* permission, not super_admin
--   C  no role
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('16000000-0000-4000-8000-00000000000a', 'uji-a@test.local'),
  ('16000000-0000-4000-8000-00000000000b', 'uji-b@test.local'),
  ('16000000-0000-4000-8000-00000000000c', 'uji-c@test.local'),
  ('16000000-0000-4000-8000-00000000000d', 'uji-d@test.local');

insert into public.roles (id, name) values
  ('16000000-0000-4000-8000-0000000000e1', 'uji_pengelola'),
  ('16000000-0000-4000-8000-0000000000e2', 'uji_ui');

insert into public.role_permissions (role_id, permission_id)
select '16000000-0000-4000-8000-0000000000e1', id from public.permissions where resource in ('roles', 'users');

insert into public.role_permissions (role_id, permission_id)
select '16000000-0000-4000-8000-0000000000e2', id from public.permissions
where (resource, action) in (('warta', 'read'), ('announcements', 'read'), ('content', 'update'));

insert into public.user_roles (user_id, role_id) values
  ('16000000-0000-4000-8000-00000000000a', (select id from public.roles where name = 'super_admin')),
  ('16000000-0000-4000-8000-00000000000b', '16000000-0000-4000-8000-0000000000e1');

-- A becomes the only super_admin.
delete from public.user_roles
where role_id = (select id from public.roles where name = 'super_admin')
  and user_id <> '16000000-0000-4000-8000-00000000000a';

select is(
  (select count(*)::int from public.user_roles where role_id = (select id from public.roles where name = 'super_admin')),
  1,
  'fixture: A is the only super_admin'
);

-- ---------------------------------------------------------------------------
-- The last super_admin, without a user identity (service role, SQL Editor)
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ delete from public.user_roles where user_id = '16000000-0000-4000-8000-00000000000a' $$,
  '42501', 'Harus ada minimal satu super_admin.',
  'postgres cannot remove the last super_admin assignment'
);

select throws_ok(
  $$ delete from auth.users where id = '16000000-0000-4000-8000-00000000000a' $$,
  '42501', 'Harus ada minimal satu super_admin.',
  'deleting the last super_admin''s auth user (Auth admin API path) is refused'
);

select throws_ok(
  $$ update public.user_roles set user_id = '16000000-0000-4000-8000-00000000000c'
     where user_id = '16000000-0000-4000-8000-00000000000a' $$,
  '42501', 'Harus ada minimal satu super_admin.',
  'moving the last super_admin assignment to another user is refused'
);

-- ---------------------------------------------------------------------------
-- The last super_admin, as B (users:* and roles:*, not a super_admin)
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"16000000-0000-4000-8000-00000000000b","role":"authenticated"}';
set local role authenticated;

select throws_ok(
  $$ select public.set_user_role('16000000-0000-4000-8000-00000000000a', (select id from public.roles where name = 'admin')) $$,
  '42501', 'Harus ada minimal satu super_admin.',
  'set_user_role cannot demote the last super_admin'
);

select throws_ok(
  $$ select public.set_user_access('16000000-0000-4000-8000-00000000000a', null, null) $$,
  '42501', 'Harus ada minimal satu super_admin.',
  'set_user_access cannot take the last super_admin''s role away'
);

select throws_ok(
  $$ update public.user_roles set role_id = (select id from public.roles where name = 'admin')
     where user_id = '16000000-0000-4000-8000-00000000000a' $$,
  '42501', 'Harus ada minimal satu super_admin.',
  'a direct REST update of the last super_admin assignment is refused'
);

select lives_ok(
  $$ select public.set_user_role('16000000-0000-4000-8000-00000000000c', (select id from public.roles where name = 'super_admin')) $$,
  'B can make C a second super_admin'
);

select lives_ok(
  $$ select public.set_user_role('16000000-0000-4000-8000-00000000000a', (select id from public.roles where name = 'admin')) $$,
  'with a second super_admin, A can be demoted'
);

select throws_ok(
  $$ delete from public.user_roles where user_id = '16000000-0000-4000-8000-00000000000c' $$,
  '42501', 'Harus ada minimal satu super_admin.',
  'now C is the last one and cannot be removed'
);

-- ---------------------------------------------------------------------------
-- The super_admin role itself
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ delete from public.roles where name = 'super_admin' $$,
  '42501', 'Role super_admin tidak bisa dihapus.',
  'B cannot delete the super_admin role'
);

select throws_ok(
  $$ update public.roles set name = 'super_admin_lama' where name = 'super_admin' $$,
  '42501', 'Nama role super_admin tidak bisa diubah.',
  'B cannot rename the super_admin role'
);

select lives_ok(
  $$ update public.roles set description = 'Akses penuh' where name = 'super_admin' $$,
  'the super_admin description can still be edited'
);

select throws_ok(
  $$ delete from public.role_permissions
     where role_id = (select id from public.roles where name = 'super_admin')
       and permission_id = (select id from public.permissions where resource = 'users' and action = 'delete') $$,
  '42501', 'Permission roles dan users milik super_admin tidak bisa dicabut.',
  'B cannot remove users:delete from super_admin'
);

select throws_ok(
  $$ select public.set_role_ui_permissions(
       (select id from public.roles where name = 'super_admin'),
       array(select id from public.permissions where resource in ('warta', 'users', 'activity_log'))
     ) $$,
  '42501', 'Permission roles dan users milik super_admin tidak bisa dicabut.',
  'the permission editor cannot drop roles:* from super_admin'
);

select lives_ok(
  $$ select public.set_role_ui_permissions(
       (select id from public.roles where name = 'super_admin'),
       array(select id from public.permissions where resource in ('warta', 'users', 'roles'))
     ) $$,
  'other super_admin grants (activity_log:read) can still be changed'
);

select ok(
  not public.has_permission('16000000-0000-4000-8000-00000000000c', 'activity_log', 'read')
    and public.has_permission('16000000-0000-4000-8000-00000000000c', 'users', 'delete'),
  'super_admin lost activity_log:read and kept users:delete'
);

-- ---------------------------------------------------------------------------
-- set_role_ui_permissions keeps hidden resources
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ select public.set_role_ui_permissions(
       '16000000-0000-4000-8000-0000000000e2',
       array(select id from public.permissions where resource = 'warta' and action in ('read', 'update'))
     ) $$,
  'set_role_ui_permissions saves a set'
);

select results_eq(
  $$ select p.resource || ':' || p.action from public.role_permissions rp
     join public.permissions p on p.id = rp.permission_id
     where rp.role_id = '16000000-0000-4000-8000-0000000000e2' order by 1 $$,
  $$ values ('announcements:read'), ('content:update'), ('warta:read'), ('warta:update') $$,
  'the hidden announcements/content grants stay untouched'
);

select throws_ok(
  $$ select public.set_role_ui_permissions(
       '16000000-0000-4000-8000-0000000000e2',
       array(select id from public.permissions where resource = 'content' and action = 'read')
     ) $$,
  '22023', 'Permission tidak dikenal.',
  'a hidden-resource id is rejected'
);

select throws_ok(
  $$ select public.set_role_ui_permissions('16000000-0000-4000-8000-0000000000ff', '{}') $$,
  'P0002', 'Role tidak ditemukan.',
  'an unknown role is rejected'
);

-- ---------------------------------------------------------------------------
-- Role names
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.roles (name) values ('UJI_UI') $$,
  '23505', null,
  'role names are unique case-insensitively'
);

select throws_ok(
  $$ insert into public.roles (name) values ('   ') $$,
  '23514', null,
  'a blank role name is rejected'
);

-- ---------------------------------------------------------------------------
-- Without the permission
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub":"16000000-0000-4000-8000-00000000000d","role":"authenticated"}';
set local role authenticated;

select throws_ok(
  $$ select public.set_role_ui_permissions('16000000-0000-4000-8000-0000000000e2', '{}') $$,
  '42501', 'Kamu tidak punya akses untuk tindakan ini.',
  'set_role_ui_permissions needs roles:update'
);

reset role;
set local request.jwt.claims = '';
set local role anon;

select throws_ok(
  $$ select public.set_role_ui_permissions('16000000-0000-4000-8000-0000000000e2', '{}') $$,
  '42501', null,
  'anon cannot call set_role_ui_permissions'
);

-- ---------------------------------------------------------------------------
-- Deleting an account keeps the warta it created
-- ---------------------------------------------------------------------------
reset role;

insert into public.warta (id, slug, tanggal_kebaktian, judul_kebaktian, created_by) values
  ('16000000-0000-4000-8000-0000000000a1', 'uji-pembuat', '2031-01-05', 'Uji Pembuat',
   '16000000-0000-4000-8000-00000000000d');

update public.warta set created_by = null where id = '16000000-0000-4000-8000-0000000000a1';
select is(
  (select created_by from public.warta where id = '16000000-0000-4000-8000-0000000000a1'),
  '16000000-0000-4000-8000-00000000000d'::uuid,
  'created_by still cannot be cleared while its user exists'
);

select lives_ok(
  $$ delete from auth.users where id = '16000000-0000-4000-8000-00000000000d' $$,
  'the author''s account can be deleted'
);

select is(
  (select created_by from public.warta where id = '16000000-0000-4000-8000-0000000000a1'),
  null,
  'the warta stays, with created_by cleared'
);

select lives_ok(
  $$ delete from auth.users where id = '16000000-0000-4000-8000-00000000000b' $$,
  'deleting a non-super_admin account works'
);

select * from finish();
rollback;
