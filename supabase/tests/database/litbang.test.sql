-- Litbang template (brief §9.6). Viewer reads but can't write; editor writes.
-- Editing or deleting a template card never touches a warta's own copy of it
-- (brief §13 #3): `warta_litbang_items.litbang_category_id` is set null.
begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres). Rolled back at the end.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('15000000-0000-4000-8000-000000000001', 'litbang-editor@test.local'),
  ('15000000-0000-4000-8000-000000000002', 'litbang-viewer@test.local');

insert into public.user_roles (user_id, role_id)
select v.user_id::uuid, r.id
from (
  values
    ('15000000-0000-4000-8000-000000000001', 'editor'),
    ('15000000-0000-4000-8000-000000000002', 'viewer')
) as v (user_id, role_name)
join public.roles r on r.name = v.role_name;

insert into public.litbang_categories (id, name, deskripsi, active, sort_order) values
  ('15000000-0000-4000-8000-0000000000d1', 'Uji Litbang Satu', 'Deskripsi satu', true, 0),
  ('15000000-0000-4000-8000-0000000000d2', 'Uji Litbang Dua', 'Deskripsi dua', true, 1),
  ('15000000-0000-4000-8000-0000000000d3', 'Uji Litbang Tiga', 'Deskripsi tiga', true, 2);

-- A warta that already copied Uji Litbang Satu, simulating what create_warta does.
insert into public.warta (id, slug, tanggal_kebaktian, judul_kebaktian)
values ('15000000-0000-4000-8000-0000000000e1', 'uji-litbang-warta', '2030-04-07', 'Uji Warta Litbang');
insert into public.warta_litbang_items (id, warta_id, litbang_category_id, name, deskripsi, sort_order)
values (
  '15000000-0000-4000-8000-0000000000f1',
  '15000000-0000-4000-8000-0000000000e1',
  '15000000-0000-4000-8000-0000000000d1',
  'Uji Litbang Satu',
  'Deskripsi satu',
  0
);

-- ---------------------------------------------------------------------------
-- Viewer: reads, can't write
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"15000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;

select is(
  (select count(*)::int from public.litbang_categories where name like 'Uji Litbang%'),
  3, 'viewer reads litbang_categories'
);
select throws_ok(
  $$ insert into public.litbang_categories (name) values ('Uji Viewer') $$,
  '42501', null::text, 'viewer cannot insert a card'
);
with u as (update public.litbang_categories set name = 'Diubah Viewer' where id = '15000000-0000-4000-8000-0000000000d1' returning 1)
select is(count(*)::int, 0, 'viewer cannot update a card') from u;
with d as (delete from public.litbang_categories where id = '15000000-0000-4000-8000-0000000000d1' returning 1)
select is(count(*)::int, 0, 'viewer cannot delete a card') from d;

-- ---------------------------------------------------------------------------
-- Editor: writes
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub":"15000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

select lives_ok(
  $$ insert into public.litbang_categories (name, deskripsi, sort_order) values ('Uji Litbang Baru', 'Uji', 3) $$,
  'editor inserts a card'
);
with u as (
  update public.litbang_categories set active = false where id = '15000000-0000-4000-8000-0000000000d2' returning 1
)
select is(count(*)::int, 1, 'editor deactivates a card') from u;
with u as (
  update public.litbang_categories set name = 'Uji Litbang Satu Diubah', deskripsi = 'Deskripsi baru'
  where id = '15000000-0000-4000-8000-0000000000d1' returning 1
)
select is(count(*)::int, 1, 'editor edits a card already copied into a warta') from u;

-- ---------------------------------------------------------------------------
-- Editing the template never touches the warta's own copy
-- ---------------------------------------------------------------------------
select results_eq(
  $$ select name, deskripsi, litbang_category_id from public.warta_litbang_items
     where id = '15000000-0000-4000-8000-0000000000f1' $$,
  $$ values ('Uji Litbang Satu'::text, 'Deskripsi satu'::text, '15000000-0000-4000-8000-0000000000d1'::uuid) $$,
  'editing the template card leaves the warta''s copy untouched'
);

-- ---------------------------------------------------------------------------
-- Deleting a card that's already copied: the FK sets litbang_category_id
-- null, and never removes or changes the warta's own row.
-- ---------------------------------------------------------------------------
with d as (delete from public.litbang_categories where id = '15000000-0000-4000-8000-0000000000d1' returning 1)
select is(count(*)::int, 1, 'editor deletes a card already copied into a warta') from d;
select results_eq(
  $$ select name, deskripsi, sort_order, litbang_category_id from public.warta_litbang_items
     where id = '15000000-0000-4000-8000-0000000000f1' $$,
  $$ values ('Uji Litbang Satu'::text, 'Deskripsi satu'::text, 0, null::uuid) $$,
  'deleting the template card only clears litbang_category_id on the warta''s copy'
);
select is(
  (select count(*)::int from public.warta_litbang_items where warta_id = '15000000-0000-4000-8000-0000000000e1'),
  1, 'the warta''s Litbang row still exists'
);

-- ---------------------------------------------------------------------------
-- reorder_litbang_categories: the remaining cards are Uji Litbang Dua
-- (inactive), Uji Litbang Tiga, and Uji Litbang Baru.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select public.reorder_litbang_categories(array[
       '15000000-0000-4000-8000-0000000000d2', '15000000-0000-4000-8000-0000000000d3',
       '15000000-0000-4000-8000-000000000fff'
     ]::uuid[]) $$,
  '22023', 'Daftar Litbang sudah berubah. Muat ulang halaman lalu coba lagi.',
  'reorder rejects a list with a foreign id, even with the right count'
);

select lives_ok(
  $$ select public.reorder_litbang_categories((
       select array_agg(id order by name) from public.litbang_categories
     )) $$,
  'reorder accepts exactly the current set of cards'
);

-- ---------------------------------------------------------------------------
-- Deactivating a card leaves an existing warta's copy untouched (brief §13 #3)
-- ---------------------------------------------------------------------------
select is(
  (select active from public.litbang_categories where id = '15000000-0000-4000-8000-0000000000d2'),
  false, 'the deactivated card stays inactive'
);
select is(
  (select count(*)::int from public.warta_litbang_items where warta_id = '15000000-0000-4000-8000-0000000000e1'),
  1, 'the warta''s Litbang row is unaffected by the deactivation'
);

-- ---------------------------------------------------------------------------
-- What the viewer's attempts left behind (as postgres)
-- ---------------------------------------------------------------------------
reset role;
select is(
  (select count(*)::int from public.litbang_categories where name = 'Diubah Viewer'),
  0, 'nothing the viewer tried to write stuck'
);
select is(
  (select count(*)::int from public.litbang_categories where name = 'Uji Viewer'),
  0, 'the viewer''s insert did not stick'
);

select * from finish();
rollback;
