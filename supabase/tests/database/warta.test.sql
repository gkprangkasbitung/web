-- Warta rules (brief §9.4, 0026): server-owned columns (slug, created_by,
-- status on insert, published_at, updated_at) and a warta's Litbang snapshot
-- are enforced in the database, since a signed-in user can call the Supabase
-- REST API directly. Also covers what deleting a warta may and may not touch
-- (brief §11) and who may delete one (§13 #2).
begin;
create extension if not exists pgtap with schema extensions;

select plan(32);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres). Rolled back at the end.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('17000000-0000-4000-8000-000000000001', 'warta-editor@test.local'),
  ('17000000-0000-4000-8000-000000000002', 'warta-viewer@test.local'),
  ('17000000-0000-4000-8000-000000000003', 'warta-admin@test.local');

insert into public.user_roles (user_id, role_id)
select v.user_id::uuid, r.id
from (values
  ('17000000-0000-4000-8000-000000000001', 'editor'),
  ('17000000-0000-4000-8000-000000000002', 'viewer'),
  ('17000000-0000-4000-8000-000000000003', 'admin')
) as v (user_id, role_name)
join public.roles r on r.name = v.role_name;

insert into public.litbang_categories (id, name, deskripsi, active, sort_order) values
  ('17000000-0000-4000-8000-0000000000c1', 'Uji Warta Aktif', 'Deskripsi template', true, 900),
  ('17000000-0000-4000-8000-0000000000c2', 'Uji Warta Nonaktif', 'Tidak ikut', false, 901);

-- Schedule and money in the new warta's service and finance weeks: deleting
-- the warta must leave both alone (brief §11).
insert into public.peribadahan_items (id, category_id, tanggal)
select '17000000-0000-4000-8000-0000000000a1', c.id, '2030-06-02'
from public.peribadahan_categories c where c.key = 'umum';

insert into public.sarana_dana_transactions (id, item_id, tanggal, tipe, jumlah)
select '17000000-0000-4000-8000-0000000000b1', i.id, '2030-05-28', 'masuk', 1000
from public.sarana_dana_items i where i.key = 'kas_jemaat';

-- ---------------------------------------------------------------------------
-- Editor: create_warta snapshots only active cards; the server owns the
-- created_by/status/published_at columns
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"17000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

select lives_ok(
  $$ select public.create_warta('2030-06-02-uji-warta-satu', '2030-06-02', 'Uji Warta Satu') $$,
  'editor creates a warta through create_warta'
);
select results_eq(
  $$ select status, created_by, published_at from public.warta where slug = '2030-06-02-uji-warta-satu' $$,
  $$ values ('draft'::text, '17000000-0000-4000-8000-000000000001'::uuid, null::timestamptz) $$,
  'a new warta is a draft owned by the caller, without published_at'
);
select results_eq(
  $$ select i.name, i.deskripsi, i.litbang_category_id
     from public.warta_litbang_items i join public.warta w on w.id = i.warta_id
     where w.slug = '2030-06-02-uji-warta-satu' and i.name like 'Uji Warta%' $$,
  $$ values ('Uji Warta Aktif'::text, 'Deskripsi template'::text, '17000000-0000-4000-8000-0000000000c1'::uuid) $$,
  'only the active template card is copied'
);

-- A direct REST insert can't publish, backdate published_at, or claim someone else as author.
select lives_ok(
  $$ insert into public.warta (slug, status, tanggal_kebaktian, judul_kebaktian, created_by, published_at)
     values ('2030-06-09-uji-warta-langsung', 'published', '2030-06-09', 'Uji Langsung',
             '17000000-0000-4000-8000-000000000002', '2000-01-01') $$,
  'editor can insert a warta directly (warta:create)'
);
select results_eq(
  $$ select status, created_by, published_at from public.warta where slug = '2030-06-09-uji-warta-langsung' $$,
  $$ values ('draft'::text, '17000000-0000-4000-8000-000000000001'::uuid, null::timestamptz) $$,
  'a direct insert is forced to draft, the caller as author, and no published_at'
);
select throws_ok(
  $$ insert into public.warta (slug, tanggal_kebaktian, judul_kebaktian) values ('Uji Slug Salah!', '2030-06-09', 'Uji') $$,
  '23514', null::text, 'a slug that is not lowercase-dash format is rejected'
);

-- ---------------------------------------------------------------------------
-- Slug is immutable; created_by can't be rewritten; published_at follows status
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ update public.warta set slug = '2030-06-02-slug-baru' where slug = '2030-06-02-uji-warta-satu' $$,
  '22023', 'Slug warta tidak bisa diubah.', 'updating the slug is rejected'
);
update public.warta set created_by = '17000000-0000-4000-8000-000000000002'
where slug = '2030-06-02-uji-warta-satu';
select is(
  (select created_by from public.warta where slug = '2030-06-02-uji-warta-satu'),
  '17000000-0000-4000-8000-000000000001'::uuid,
  'created_by keeps its original value'
);

update public.warta set status = 'published', published_at = '2000-01-01'
where slug = '2030-06-02-uji-warta-satu';
select is(
  (select published_at from public.warta where slug = '2030-06-02-uji-warta-satu'),
  now(),
  'publishing sets published_at to now(), ignoring the sent value'
);
update public.warta set tema_kebaktian = 'Tema uji', published_at = '2000-01-01'
where slug = '2030-06-02-uji-warta-satu';
select is(
  (select published_at from public.warta where slug = '2030-06-02-uji-warta-satu'),
  now(),
  'published_at can''t be rewritten while the status stays published'
);
update public.warta set status = 'draft', published_at = '2000-01-01'
where slug = '2030-06-02-uji-warta-satu';
select is(
  (select published_at from public.warta where slug = '2030-06-02-uji-warta-satu'),
  null::timestamptz,
  'unpublishing clears published_at, ignoring the sent value'
);

-- ---------------------------------------------------------------------------
-- updated_at moves on content edits only. now() is fixed inside this
-- transaction, so first push updated_at into the past with the trigger off.
-- ---------------------------------------------------------------------------
reset role;
alter table public.warta disable trigger warta_enforce_rules;
update public.warta set updated_at = '2000-01-01' where slug = '2030-06-02-uji-warta-satu';
alter table public.warta enable trigger warta_enforce_rules;
set local request.jwt.claims = '{"sub":"17000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

update public.warta set status = 'published' where slug = '2030-06-02-uji-warta-satu';
select is(
  (select updated_at from public.warta where slug = '2030-06-02-uji-warta-satu'),
  '2000-01-01'::timestamptz,
  'a status-only change leaves updated_at alone'
);
update public.warta set updated_at = '1999-01-01' where slug = '2030-06-02-uji-warta-satu';
select is(
  (select updated_at from public.warta where slug = '2030-06-02-uji-warta-satu'),
  '2000-01-01'::timestamptz,
  'updated_at can''t be set directly'
);
update public.warta set renungan_isi = 'Isi renungan uji' where slug = '2030-06-02-uji-warta-satu';
select is(
  (select updated_at from public.warta where slug = '2030-06-02-uji-warta-satu'),
  now(),
  'a content change moves updated_at to now()'
);

-- ---------------------------------------------------------------------------
-- A warta's Litbang cards: only deskripsi is editable; no adds or removes
-- ---------------------------------------------------------------------------
with u as (
  update public.warta_litbang_items set deskripsi = 'Deskripsi khusus warta'
  where litbang_category_id = '17000000-0000-4000-8000-0000000000c1' returning 1
)
select is(count(*)::int, 1, 'editor edits a warta''s Litbang deskripsi') from u;
select is(
  (select deskripsi from public.litbang_categories where id = '17000000-0000-4000-8000-0000000000c1'),
  'Deskripsi template',
  'editing the warta''s copy leaves the template untouched'
);
select throws_ok(
  $$ update public.warta_litbang_items set name = 'Nama Baru'
     where litbang_category_id = '17000000-0000-4000-8000-0000000000c1' $$,
  '22023', 'Nama Litbang pada warta tidak bisa diubah.', 'the name of a warta''s Litbang card is fixed'
);
select throws_ok(
  $$ update public.warta_litbang_items
     set warta_id = (select id from public.warta where slug = '2030-06-09-uji-warta-langsung')
     where litbang_category_id = '17000000-0000-4000-8000-0000000000c1' $$,
  '22023', 'Warta pemilik Litbang tidak bisa diubah.', 'a card can''t move to another warta'
);
select throws_ok(
  $$ update public.warta_litbang_items set litbang_category_id = '17000000-0000-4000-8000-0000000000c2'
     where litbang_category_id = '17000000-0000-4000-8000-0000000000c1' $$,
  '22023', 'Kartu template Litbang tidak bisa diubah.', 'a card can''t be pointed at another template card'
);
select throws_ok(
  $$ insert into public.warta_litbang_items (warta_id, name)
     select id, 'Kartu Tambahan' from public.warta where slug = '2030-06-02-uji-warta-satu' $$,
  '42501', null::text, 'editor cannot add a Litbang card to a warta directly'
);
with d as (
  delete from public.warta_litbang_items
  where litbang_category_id = '17000000-0000-4000-8000-0000000000c1' returning 1
)
select is(count(*)::int, 0, 'editor cannot remove a Litbang card from a warta directly') from d;

select lives_ok(
  $$ insert into public.warta_kesaksian_items (warta_id, judul, sort_order)
     select id, 'Uji Kesaksian', 0 from public.warta where slug = '2030-06-02-uji-warta-satu' $$,
  'editor adds a Kesaksian item'
);

-- Deleting the template card still clears the copy's link (FK set null passes the trigger).
reset role;
delete from public.litbang_categories where id = '17000000-0000-4000-8000-0000000000c1';
select results_eq(
  $$ select i.litbang_category_id, i.deskripsi from public.warta_litbang_items i
     join public.warta w on w.id = i.warta_id
     where w.slug = '2030-06-02-uji-warta-satu' and i.name = 'Uji Warta Aktif' $$,
  $$ values (null::uuid, 'Deskripsi khusus warta'::text) $$,
  'deleting the template card only clears litbang_category_id on the warta''s copy'
);

-- ---------------------------------------------------------------------------
-- Delete: viewer and editor can't; admin can, and only Litbang + Kesaksian go
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"17000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;

with u as (update public.warta set status = 'draft' where slug = '2030-06-02-uji-warta-satu' returning 1)
select is(count(*)::int, 0, 'viewer cannot change a warta') from u;

set local request.jwt.claims = '{"sub":"17000000-0000-4000-8000-000000000001","role":"authenticated"}';

with d as (delete from public.warta where slug = '2030-06-02-uji-warta-satu' returning 1)
select is(count(*)::int, 0, 'editor cannot delete a warta') from d;

set local request.jwt.claims = '{"sub":"17000000-0000-4000-8000-000000000003","role":"authenticated"}';

create temporary table deleted_warta on commit drop as
select id from public.warta where slug = '2030-06-02-uji-warta-satu';

with d as (delete from public.warta where slug = '2030-06-02-uji-warta-satu' returning 1)
select is(count(*)::int, 1, 'admin deletes a warta') from d;

reset role;
select is(
  (select count(*)::int from public.warta_litbang_items where warta_id in (select id from deleted_warta)),
  0, 'the warta''s own Litbang cards are deleted with it'
);
select is(
  (select count(*)::int from public.warta_kesaksian_items where warta_id in (select id from deleted_warta)),
  0, 'the warta''s own Kesaksian items are deleted with it'
);
select is(
  (select count(*)::int from public.peribadahan_items where id = '17000000-0000-4000-8000-0000000000a1'),
  1, 'schedule rows in the service week stay'
);
select is(
  (select count(*)::int from public.sarana_dana_transactions where id = '17000000-0000-4000-8000-0000000000b1'),
  1, 'transactions in the finance week stay'
);
select is(
  (select count(*)::int from public.warta where slug = '2030-06-09-uji-warta-langsung'),
  1, 'other warta stay'
);
select is(
  (select count(*)::int from public.litbang_categories where id = '17000000-0000-4000-8000-0000000000c2'),
  1, 'the Litbang template stays'
);

select * from finish();
rollback;
