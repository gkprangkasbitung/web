-- The atomic RPCs (brief §12.6): who may call them, and what they write.
begin;
create extension if not exists pgtap with schema extensions;

select plan(67);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres). Rolled back at the end.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('13000000-0000-4000-8000-000000000001', 'rpc-superadmin@test.local'),
  ('13000000-0000-4000-8000-000000000002', 'rpc-admin@test.local'),
  ('13000000-0000-4000-8000-000000000003', 'rpc-editor@test.local'),
  ('13000000-0000-4000-8000-000000000004', 'rpc-viewer@test.local'),
  ('13000000-0000-4000-8000-000000000005', 'rpc-target-1@test.local'),
  ('13000000-0000-4000-8000-000000000006', 'rpc-target-2@test.local');

insert into public.user_roles (user_id, role_id)
select v.user_id::uuid, r.id
from (
  values
    ('13000000-0000-4000-8000-000000000001', 'super_admin'),
    ('13000000-0000-4000-8000-000000000002', 'admin'),
    ('13000000-0000-4000-8000-000000000003', 'editor'),
    ('13000000-0000-4000-8000-000000000004', 'viewer')
) as v (user_id, role_name)
join public.roles r on r.name = v.role_name;

insert into public.roles (id, name) values ('13000000-0000-4000-8000-0000000000e1', 'uji_role');

insert into public.keluarga (id, nama) values ('13000000-0000-4000-8000-0000000000c1', 'Uji Keluarga RPC');
insert into public.jemaat (id, nama, keluarga_id, hubungan_keluarga) values
  ('13000000-0000-4000-8000-0000000000a1', 'Uji Jemaat Satu', '13000000-0000-4000-8000-0000000000c1', 'Kepala Keluarga'),
  ('13000000-0000-4000-8000-0000000000a2', 'Uji Jemaat Dua', '13000000-0000-4000-8000-0000000000c1', 'Anak');
insert into public.label_jemaat (id, nama) values
  ('13000000-0000-4000-8000-0000000000b1', 'Uji Label Satu'),
  ('13000000-0000-4000-8000-0000000000b2', 'Uji Label Dua');

-- A known Litbang template: two active cards and one inactive.
delete from public.litbang_categories;
insert into public.litbang_categories (id, name, deskripsi, active, sort_order) values
  ('13000000-0000-4000-8000-0000000000d1', 'Uji Litbang Satu', 'Deskripsi satu', true, 0),
  ('13000000-0000-4000-8000-0000000000d2', 'Uji Litbang Dua', 'Deskripsi dua', false, 1),
  ('13000000-0000-4000-8000-0000000000d3', 'Uji Litbang Tiga', 'Deskripsi tiga', true, 2);

-- One call per write RPC, reused for the anon, viewer, and admin checks.
create temp table rpc_calls (name text, call text);
insert into rpc_calls (name, call) values
  ('set_user_role', $$ select public.set_user_role('13000000-0000-4000-8000-000000000005', null) $$),
  ('link_user_jemaat', $$ select public.link_user_jemaat('13000000-0000-4000-8000-000000000005', null) $$),
  ('set_user_access', $$ select public.set_user_access('13000000-0000-4000-8000-000000000005', null, null) $$),
  ('set_role_permissions', $$ select public.set_role_permissions('13000000-0000-4000-8000-0000000000e1', '{}') $$),
  ('create_warta', $$ select public.create_warta('uji-rpc-ditolak', '2030-02-03', 'Uji Ditolak') $$),
  ('reorder_litbang_categories', $$ select public.reorder_litbang_categories('{}') $$),
  ('delete_keluarga', $$ select public.delete_keluarga('13000000-0000-4000-8000-0000000000c1') $$),
  ('replace_jemaat_labels', $$ select public.replace_jemaat_labels('13000000-0000-4000-8000-0000000000a1', '{}') $$);
grant select on rpc_calls to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Who may call
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"role":"anon"}';
set local role anon;

select throws_ok(call, '42501', null::text, format('anon cannot call %s', name))
from rpc_calls order by name;

reset role;
set local request.jwt.claims = '{"sub":"13000000-0000-4000-8000-000000000004","role":"authenticated"}';
set local role authenticated;

select throws_ok(call, '42501', 'Kamu tidak punya akses untuk tindakan ini.', format('viewer cannot call %s', name))
from rpc_calls order by name;

reset role;
set local request.jwt.claims = '{"sub":"13000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;

select throws_ok(call, '42501', 'Kamu tidak punya akses untuk tindakan ini.', format('admin cannot call %s', name))
from rpc_calls
where name in ('set_user_role', 'link_user_jemaat', 'set_user_access', 'set_role_permissions')
order by name;

-- ---------------------------------------------------------------------------
-- super_admin: set_user_role
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub":"13000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

select lives_ok(
  $$ select public.set_user_role('13000000-0000-4000-8000-000000000005', (select id from public.roles where name = 'editor')) $$,
  'set_user_role assigns a role'
);
select results_eq(
  $$ select r.name from public.user_roles ur join public.roles r on r.id = ur.role_id
     where ur.user_id = '13000000-0000-4000-8000-000000000005' $$,
  $$ values ('editor') $$,
  'the user now has exactly that role'
);

select lives_ok(
  $$ select public.set_user_role('13000000-0000-4000-8000-000000000005', (select id from public.roles where name = 'viewer')) $$,
  'set_user_role replaces the role'
);
select results_eq(
  $$ select r.name from public.user_roles ur join public.roles r on r.id = ur.role_id
     where ur.user_id = '13000000-0000-4000-8000-000000000005' $$,
  $$ values ('viewer') $$,
  'the old role is gone and only the new one remains'
);

select lives_ok(
  $$ select public.set_user_role('13000000-0000-4000-8000-000000000005', (select id from public.roles where name = 'viewer')) $$,
  'setting the same role again is a no-op'
);

select lives_ok(
  $$ select public.set_user_role('13000000-0000-4000-8000-000000000005', null) $$,
  'set_user_role with null removes every role ("Tidak ada")'
);
select is_empty(
  $$ select 1 from public.user_roles where user_id = '13000000-0000-4000-8000-000000000005' $$,
  'the user has no roles left'
);

select throws_ok(
  $$ select public.set_user_role('13000000-0000-4000-8000-0000000000ff', null) $$,
  'P0002', 'Pengguna tidak ditemukan.',
  'set_user_role rejects an unknown user'
);
select throws_ok(
  $$ select public.set_user_role('13000000-0000-4000-8000-000000000005', '13000000-0000-4000-8000-0000000000ff') $$,
  'P0002', 'Role tidak ditemukan.',
  'set_user_role rejects an unknown role'
);

-- ---------------------------------------------------------------------------
-- super_admin: link_user_jemaat
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ select public.link_user_jemaat('13000000-0000-4000-8000-000000000005', '13000000-0000-4000-8000-0000000000a1') $$,
  'link_user_jemaat links a jemaat'
);
select is(
  (select jemaat_id from public.profiles where id = '13000000-0000-4000-8000-000000000005'),
  '13000000-0000-4000-8000-0000000000a1'::uuid,
  'the profile points at the jemaat'
);

select throws_ok(
  $$ select public.link_user_jemaat('13000000-0000-4000-8000-000000000006', '13000000-0000-4000-8000-0000000000a1') $$,
  '23505', 'Jemaat ini sudah terhubung ke akun lain.',
  'a jemaat can be linked to one account only'
);
select throws_ok(
  $$ select public.link_user_jemaat('13000000-0000-4000-8000-000000000006', '13000000-0000-4000-8000-0000000000ff') $$,
  'P0002', 'Jemaat tidak ditemukan.',
  'link_user_jemaat rejects an unknown jemaat'
);

select lives_ok(
  $$ select public.link_user_jemaat('13000000-0000-4000-8000-000000000005', null) $$,
  'link_user_jemaat with null unlinks'
);
select is(
  (select jemaat_id from public.profiles where id = '13000000-0000-4000-8000-000000000005'),
  null::uuid,
  'the profile no longer points at a jemaat'
);

-- ---------------------------------------------------------------------------
-- super_admin: set_user_access (role + jemaat together)
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ select public.set_user_access(
       '13000000-0000-4000-8000-000000000006',
       (select id from public.roles where name = 'admin'),
       '13000000-0000-4000-8000-0000000000a2'
     ) $$,
  'set_user_access sets role and jemaat'
);
select results_eq(
  $$ select r.name from public.user_roles ur join public.roles r on r.id = ur.role_id
     where ur.user_id = '13000000-0000-4000-8000-000000000006' $$,
  $$ values ('admin') $$,
  'set_user_access assigned the role'
);
select is(
  (select jemaat_id from public.profiles where id = '13000000-0000-4000-8000-000000000006'),
  '13000000-0000-4000-8000-0000000000a2'::uuid,
  'set_user_access linked the jemaat'
);

select throws_ok(
  $$ select public.set_user_access(
       '13000000-0000-4000-8000-000000000005',
       (select id from public.roles where name = 'editor'),
       '13000000-0000-4000-8000-0000000000a2'
     ) $$,
  '23505', 'Jemaat ini sudah terhubung ke akun lain.',
  'set_user_access fails when the jemaat step fails'
);
select is_empty(
  $$ select 1 from public.user_roles where user_id = '13000000-0000-4000-8000-000000000005' $$,
  'and the role step was rolled back with it'
);

-- ---------------------------------------------------------------------------
-- super_admin: set_role_permissions
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ select public.set_role_permissions(
       '13000000-0000-4000-8000-0000000000e1',
       array(select id from public.permissions where resource = 'warta' and action in ('read', 'update'))
     ) $$,
  'set_role_permissions sets a permission set'
);
select results_eq(
  $$ select p.resource || ':' || p.action from public.role_permissions rp
     join public.permissions p on p.id = rp.permission_id
     where rp.role_id = '13000000-0000-4000-8000-0000000000e1' order by 1 $$,
  $$ values ('warta:read'), ('warta:update') $$,
  'the role has exactly those permissions'
);

select lives_ok(
  $$ select public.set_role_permissions(
       '13000000-0000-4000-8000-0000000000e1',
       array(select id from public.permissions where resource = 'warta' and action = 'read')
     ) $$,
  'set_role_permissions replaces the set'
);
select results_eq(
  $$ select p.resource || ':' || p.action from public.role_permissions rp
     join public.permissions p on p.id = rp.permission_id
     where rp.role_id = '13000000-0000-4000-8000-0000000000e1' $$,
  $$ values ('warta:read') $$,
  'permissions left out of the set are removed'
);

select throws_ok(
  $$ select public.set_role_permissions('13000000-0000-4000-8000-0000000000e1', array['13000000-0000-4000-8000-0000000000ff'::uuid]) $$,
  '23503', 'Permission tidak ditemukan.',
  'set_role_permissions rejects an unknown permission'
);
select throws_ok(
  $$ select public.set_role_permissions('13000000-0000-4000-8000-0000000000ff', '{}') $$,
  'P0002', 'Role tidak ditemukan.',
  'set_role_permissions rejects an unknown role'
);

-- ---------------------------------------------------------------------------
-- editor: replace_jemaat_labels
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub":"13000000-0000-4000-8000-000000000003","role":"authenticated"}';
set local role authenticated;

select lives_ok(
  $$ select public.replace_jemaat_labels(
       '13000000-0000-4000-8000-0000000000a1',
       array['13000000-0000-4000-8000-0000000000b1', '13000000-0000-4000-8000-0000000000b2']::uuid[]
     ) $$,
  'replace_jemaat_labels sets labels'
);
select results_eq(
  $$ select label_id from public.jemaat_labels where jemaat_id = '13000000-0000-4000-8000-0000000000a1' order by 1 $$,
  $$ values ('13000000-0000-4000-8000-0000000000b1'::uuid), ('13000000-0000-4000-8000-0000000000b2'::uuid) $$,
  'the jemaat has both labels'
);

select lives_ok(
  $$ select public.replace_jemaat_labels(
       '13000000-0000-4000-8000-0000000000a1', array['13000000-0000-4000-8000-0000000000b2']::uuid[]
     ) $$,
  'replace_jemaat_labels replaces the set'
);
select results_eq(
  $$ select label_id from public.jemaat_labels where jemaat_id = '13000000-0000-4000-8000-0000000000a1' $$,
  $$ values ('13000000-0000-4000-8000-0000000000b2'::uuid) $$,
  'labels left out of the set are removed'
);

select lives_ok(
  $$ select public.replace_jemaat_labels('13000000-0000-4000-8000-0000000000a1', '{}') $$,
  'an empty set clears every label'
);
select is_empty(
  $$ select 1 from public.jemaat_labels where jemaat_id = '13000000-0000-4000-8000-0000000000a1' $$,
  'the jemaat has no labels left'
);

select throws_ok(
  $$ select public.replace_jemaat_labels(
       '13000000-0000-4000-8000-0000000000a1', array['13000000-0000-4000-8000-0000000000ff']::uuid[]
     ) $$,
  '23503', 'Label tidak ditemukan.',
  'replace_jemaat_labels rejects an unknown label'
);
select throws_ok(
  $$ select public.replace_jemaat_labels('13000000-0000-4000-8000-0000000000ff', '{}') $$,
  'P0002', 'Jemaat tidak ditemukan.',
  'replace_jemaat_labels rejects an unknown jemaat'
);

-- ---------------------------------------------------------------------------
-- editor: create_warta
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ select public.create_warta('uji-rpc-warta', '2030-02-03', 'Uji Warta RPC', 'Tema uji') $$,
  'editor creates a warta'
);
select results_eq(
  $$ select status, created_by, judul_kebaktian, tema_kebaktian from public.warta where slug = 'uji-rpc-warta' $$,
  $$ values ('draft'::text, '13000000-0000-4000-8000-000000000003'::uuid, 'Uji Warta RPC'::text, 'Tema uji'::text) $$,
  'the new warta is a draft created by the caller'
);
select results_eq(
  $$ select i.name, i.deskripsi, i.litbang_category_id, i.sort_order
     from public.warta_litbang_items i join public.warta w on w.id = i.warta_id
     where w.slug = 'uji-rpc-warta' order by i.sort_order $$,
  $$ values
       ('Uji Litbang Satu'::text, 'Deskripsi satu'::text, '13000000-0000-4000-8000-0000000000d1'::uuid, 0),
       ('Uji Litbang Tiga', 'Deskripsi tiga', '13000000-0000-4000-8000-0000000000d3'::uuid, 2) $$,
  'only the active Litbang cards are copied into the warta'
);

select throws_ok(
  $$ select public.create_warta('uji-rpc-warta', '2030-02-10', 'Slug Sama') $$,
  '23505', null::text,
  'a taken slug raises unique_violation so the caller can retry'
);
select throws_ok(
  $$ select public.create_warta('uji-rpc-warta-2', '2030-02-10', '   ') $$,
  '22023', 'Judul Kebaktian wajib diisi.',
  'a blank judul is rejected'
);

-- ---------------------------------------------------------------------------
-- editor: reorder_litbang_categories
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ select public.reorder_litbang_categories(array[
       '13000000-0000-4000-8000-0000000000d3', '13000000-0000-4000-8000-0000000000d2', '13000000-0000-4000-8000-0000000000d1'
     ]::uuid[]) $$,
  'reorder_litbang_categories saves a new order'
);
select results_eq(
  $$ select id, sort_order from public.litbang_categories order by sort_order $$,
  $$ values
       ('13000000-0000-4000-8000-0000000000d3'::uuid, 0),
       ('13000000-0000-4000-8000-0000000000d2'::uuid, 1),
       ('13000000-0000-4000-8000-0000000000d1'::uuid, 2) $$,
  'sort_order is each card''s position, starting at 0'
);

select throws_ok(
  $$ select public.reorder_litbang_categories(array[
       '13000000-0000-4000-8000-0000000000d1', '13000000-0000-4000-8000-0000000000d2'
     ]::uuid[]) $$,
  '22023', 'Daftar Litbang sudah berubah. Muat ulang halaman lalu coba lagi.',
  'a list missing a card is rejected'
);
select throws_ok(
  $$ select public.reorder_litbang_categories(array[
       '13000000-0000-4000-8000-0000000000d1', '13000000-0000-4000-8000-0000000000d1', '13000000-0000-4000-8000-0000000000d2'
     ]::uuid[]) $$,
  '22023', 'Daftar Litbang sudah berubah. Muat ulang halaman lalu coba lagi.',
  'a list with a duplicate is rejected'
);

-- ---------------------------------------------------------------------------
-- editor: delete_keluarga
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ select public.delete_keluarga('13000000-0000-4000-8000-0000000000c1') $$,
  'delete_keluarga deletes a family'
);
select is_empty(
  $$ select 1 from public.keluarga where id = '13000000-0000-4000-8000-0000000000c1' $$,
  'the family is gone'
);
select results_eq(
  $$ select id, keluarga_id, hubungan_keluarga from public.jemaat
     where id in ('13000000-0000-4000-8000-0000000000a1', '13000000-0000-4000-8000-0000000000a2') order by nama $$,
  $$ values
       ('13000000-0000-4000-8000-0000000000a2'::uuid, null::uuid, null::text),
       ('13000000-0000-4000-8000-0000000000a1'::uuid, null::uuid, null::text) $$,
  'its members remain, with keluarga and hubungan cleared'
);
select throws_ok(
  $$ select public.delete_keluarga('13000000-0000-4000-8000-0000000000c1') $$,
  'P0002', 'Keluarga tidak ditemukan.',
  'delete_keluarga rejects an unknown family'
);

select * from finish();
rollback;
