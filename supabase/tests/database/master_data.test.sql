-- Master data (brief §9.8): Tempat, Wilayah, Label Jemaat.
-- Viewer reads but can't write; editor writes. Deleting a Tempat or Wilayah
-- clears references to it; deleting a label removes its assignments.
begin;
create extension if not exists pgtap with schema extensions;

select plan(27);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres). Rolled back at the end.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('14000000-0000-4000-8000-000000000001', 'md-editor@test.local'),
  ('14000000-0000-4000-8000-000000000002', 'md-viewer@test.local');

insert into public.user_roles (user_id, role_id)
select v.user_id::uuid, r.id
from (
  values
    ('14000000-0000-4000-8000-000000000001', 'editor'),
    ('14000000-0000-4000-8000-000000000002', 'viewer')
) as v (user_id, role_name)
join public.roles r on r.name = v.role_name;

insert into public.tempat (id, nama, keterangan) values
  ('14000000-0000-4000-8000-0000000000c1', 'Uji Tempat Dipakai', 'Uji alamat'),
  ('14000000-0000-4000-8000-0000000000c2', 'Uji Tempat Lain', null);
insert into public.wilayah (id, nama) values
  ('14000000-0000-4000-8000-0000000000c3', 'Uji Wilayah Dipakai');
insert into public.label_jemaat (id, nama) values
  ('14000000-0000-4000-8000-0000000000c4', 'Uji Label Dipakai');

insert into public.jemaat (id, nama, wilayah_id) values
  ('14000000-0000-4000-8000-0000000000a1', 'Uji Jemaat MD', '14000000-0000-4000-8000-0000000000c3');
insert into public.jemaat_labels (jemaat_id, label_id) values
  ('14000000-0000-4000-8000-0000000000a1', '14000000-0000-4000-8000-0000000000c4');

insert into public.peribadahan_items (id, category_id, tanggal, tempat_id, wilayah_id)
select '14000000-0000-4000-8000-0000000000d1', id, '2030-03-03',
  '14000000-0000-4000-8000-0000000000c1', '14000000-0000-4000-8000-0000000000c3'
from public.peribadahan_categories where key = 'krt';

-- ---------------------------------------------------------------------------
-- Viewer: reads, can't write
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"14000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;

select is((select count(*)::int from public.tempat where nama like 'Uji Tempat%'), 2, 'viewer reads tempat');
select is((select count(*)::int from public.wilayah where nama like 'Uji Wilayah%'), 1, 'viewer reads wilayah');
select is((select count(*)::int from public.label_jemaat where nama like 'Uji Label%'), 1, 'viewer reads label_jemaat');

select throws_ok($$ insert into public.tempat (nama) values ('Uji Viewer') $$, '42501', null::text, 'viewer cannot insert tempat');
select throws_ok($$ insert into public.wilayah (nama) values ('Uji Viewer') $$, '42501', null::text, 'viewer cannot insert wilayah');
select throws_ok($$ insert into public.label_jemaat (nama) values ('Uji Viewer') $$, '42501', null::text, 'viewer cannot insert label_jemaat');

with u as (update public.tempat set nama = 'Diubah Viewer' where id = '14000000-0000-4000-8000-0000000000c1' returning 1)
select is(count(*)::int, 0, 'viewer cannot update tempat') from u;
with u as (update public.wilayah set nama = 'Diubah Viewer' where id = '14000000-0000-4000-8000-0000000000c3' returning 1)
select is(count(*)::int, 0, 'viewer cannot update wilayah') from u;
with u as (update public.label_jemaat set nama = 'Diubah Viewer' where id = '14000000-0000-4000-8000-0000000000c4' returning 1)
select is(count(*)::int, 0, 'viewer cannot update label_jemaat') from u;

with d as (delete from public.tempat where id = '14000000-0000-4000-8000-0000000000c1' returning 1)
select is(count(*)::int, 0, 'viewer cannot delete tempat') from d;
with d as (delete from public.wilayah where id = '14000000-0000-4000-8000-0000000000c3' returning 1)
select is(count(*)::int, 0, 'viewer cannot delete wilayah') from d;
with d as (delete from public.label_jemaat where id = '14000000-0000-4000-8000-0000000000c4' returning 1)
select is(count(*)::int, 0, 'viewer cannot delete label_jemaat') from d;

-- ---------------------------------------------------------------------------
-- Editor: writes
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub":"14000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

select lives_ok($$ insert into public.tempat (nama, keterangan, sort_order) values ('Uji Tempat Baru', 'Uji', 9) $$, 'editor inserts tempat');
with u as (update public.tempat set nama = 'Uji Tempat Lain Diubah' where id = '14000000-0000-4000-8000-0000000000c2' returning 1)
select is(count(*)::int, 1, 'editor updates tempat') from u;
select throws_ok(
  $$ insert into public.label_jemaat (nama) values ('Uji Label Dipakai') $$,
  '23505', null::text, 'label_jemaat.nama is unique');

-- Deletes that other rows reference, done by the editor: the foreign key
-- actions run regardless of RLS on the referencing tables.
with d as (delete from public.tempat where id = '14000000-0000-4000-8000-0000000000c1' returning 1)
select is(count(*)::int, 1, 'editor deletes a tempat used by peribadahan_items') from d;
with d as (delete from public.wilayah where id = '14000000-0000-4000-8000-0000000000c3' returning 1)
select is(count(*)::int, 1, 'editor deletes a wilayah used by peribadahan_items and jemaat') from d;
with d as (delete from public.label_jemaat where id = '14000000-0000-4000-8000-0000000000c4' returning 1)
select is(count(*)::int, 1, 'editor deletes a label assigned to a jemaat') from d;

-- ---------------------------------------------------------------------------
-- What the deletes left behind (as postgres)
-- ---------------------------------------------------------------------------
reset role;

select is(
  (select count(*)::int from public.peribadahan_items where id = '14000000-0000-4000-8000-0000000000d1'),
  1, 'the schedule row survives');
select is(
  (select tempat_id from public.peribadahan_items where id = '14000000-0000-4000-8000-0000000000d1'),
  null, 'peribadahan_items.tempat_id is cleared');
select is(
  (select wilayah_id from public.peribadahan_items where id = '14000000-0000-4000-8000-0000000000d1'),
  null, 'peribadahan_items.wilayah_id is cleared');

select is(
  (select count(*)::int from public.jemaat where id = '14000000-0000-4000-8000-0000000000a1'),
  1, 'the jemaat survives');
select is(
  (select wilayah_id from public.jemaat where id = '14000000-0000-4000-8000-0000000000a1'),
  null, 'jemaat.wilayah_id is cleared');
select is(
  (select count(*)::int from public.jemaat_labels where jemaat_id = '14000000-0000-4000-8000-0000000000a1'),
  0, 'the label assignment is removed');

select is(
  (select nama from public.tempat where id = '14000000-0000-4000-8000-0000000000c2'),
  'Uji Tempat Lain Diubah', 'the editor''s update stuck');
select is(
  (select count(*)::int from public.tempat where nama = 'Uji Tempat Baru'),
  1, 'the editor''s insert stuck');
select is(
  (select count(*)::int from public.tempat where nama = 'Diubah Viewer'),
  0, 'nothing the viewer tried stuck');

select * from finish();
rollback;
