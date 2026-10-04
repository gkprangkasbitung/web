-- Kalender Kegiatan (brief §14.4; migration 0033). kategori_kegiatan, the
-- calendar edition of kegiatan (a date/time range, a category, an immutable
-- slug, no more direct anon select), and the three public functions
-- (kegiatan_bulan, kegiatan_detail, kegiatan_mendatang).
begin;
create extension if not exists pgtap with schema extensions;

select plan(53);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres). Rolled back at the end. Dates are relative to
-- today in Asia/Jakarta, so this file stays valid whenever it's run.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('2d000000-0000-4000-8000-000000000001', 'kal-editor@test.local'),
  ('2d000000-0000-4000-8000-000000000002', 'kal-viewer@test.local'),
  ('2d000000-0000-4000-8000-000000000003', 'kal-admin@test.local');

insert into public.user_roles (user_id, role_id)
select v.user_id::uuid, r.id
from (
  values
    ('2d000000-0000-4000-8000-000000000001', 'editor'),
    ('2d000000-0000-4000-8000-000000000002', 'viewer'),
    ('2d000000-0000-4000-8000-000000000003', 'admin')
) as v (user_id, role_name)
join public.roles r on r.name = v.role_name;

insert into public.komisi (id, nama, slug, tampil, sort_order) values
  ('2d000000-0000-4000-8000-0000000000f1', 'Komisi Uji Tampil', 'komisi-uji-tampil', true, 0),
  ('2d000000-0000-4000-8000-0000000000f2', 'Komisi Uji Sembunyi', 'komisi-uji-sembunyi', false, 1);

-- ---------------------------------------------------------------------------
-- kategori_kegiatan: seed, warna check, nama uniqueness
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from public.kategori_kegiatan),
  5, 'seeded with the brief''s 5 categories'
);
select results_eq(
  $$ select nama, warna from public.kategori_kegiatan order by sort_order $$,
  $$ values
     ('Ibadah khusus'::text, 'hijau'::text),
     ('Pemuda & Remaja'::text, 'oranye'::text),
     ('Anak'::text, 'biru'::text),
     ('Diakonia'::text, 'merah'::text),
     ('Rapat & organisasi'::text, 'abu'::text) $$,
  'seed names and colors match the brief exactly, in order'
);
select throws_ok(
  $$ insert into public.kategori_kegiatan (nama, warna) values ('Warna Aneh', 'violet') $$,
  '23514', null::text, 'kategori_kegiatan.warna: only a palette key is accepted'
);
select throws_ok(
  $$ insert into public.kategori_kegiatan (nama, warna) values ('Ibadah Khusus', 'teal') $$,
  '23505', null::text, 'kategori_kegiatan.nama is unique case-insensitively'
);

-- ---------------------------------------------------------------------------
-- kegiatan: field rules (as postgres, so only constraints/triggers apply)
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.kegiatan (judul, slug, tanggal_mulai, tanggal_selesai, kategori_id) values
       ('Rentang Salah', 'rentang-salah', '2026-06-20', '2026-06-10',
        (select id from public.kategori_kegiatan order by sort_order limit 1)) $$,
  '23514', null::text, 'tanggal_selesai before tanggal_mulai is refused'
);
select throws_ok(
  $$ insert into public.kegiatan (judul, slug, tanggal_mulai, tanggal_selesai, kategori_id) values
       ('Terlalu Panjang', 'terlalu-panjang', '2026-06-01', '2026-07-05',
        (select id from public.kategori_kegiatan order by sort_order limit 1)) $$,
  '23514', null::text, 'a span over 31 days is refused'
);
select lives_ok(
  $$ insert into public.kegiatan (judul, slug, tanggal_mulai, tanggal_selesai, kategori_id) values
       ('Tepat 31 Hari', 'tepat-31-hari', '2026-06-01', '2026-07-01',
        (select id from public.kategori_kegiatan order by sort_order limit 1)) $$,
  'a span of exactly 31 days (the inclusive max) passes'
);
delete from public.kegiatan where slug = 'tepat-31-hari';
select throws_ok(
  $$ insert into public.kegiatan (judul, slug, tanggal_mulai, tanggal_selesai, waktu_mulai, waktu_selesai, kategori_id) values
       ('Waktu Salah', 'waktu-salah', '2026-06-01', '2026-06-01', '20:00', '19:00',
        (select id from public.kategori_kegiatan order by sort_order limit 1)) $$,
  '23514', null::text, 'same-day waktu_selesai before waktu_mulai is refused'
);
select lives_ok(
  $$ insert into public.kegiatan (judul, slug, tanggal_mulai, tanggal_selesai, waktu_mulai, waktu_selesai, kategori_id) values
       ('Lintas Hari', 'lintas-hari-waktu', '2026-06-01', '2026-06-02', '20:00', '06:00',
        (select id from public.kategori_kegiatan order by sort_order limit 1)) $$,
  'waktu_selesai before waktu_mulai passes when the dates differ (overnight)'
);
delete from public.kegiatan where slug = 'lintas-hari-waktu';
select throws_ok(
  $$ insert into public.kegiatan (judul, slug, tanggal_mulai, tanggal_selesai, maps_url, kategori_id) values
       ('Maps Salah', 'maps-salah', '2026-06-01', '2026-06-01', 'https://bing.com/maps',
        (select id from public.kategori_kegiatan order by sort_order limit 1)) $$,
  '23514', null::text, 'maps_url: only a Google Maps host is accepted'
);
select throws_ok(
  $$ insert into public.kegiatan (judul, slug, tanggal_mulai, tanggal_selesai, kategori_id) values
       ('Slug Jelek', 'Slug Jelek!!', '2026-06-01', '2026-06-01',
        (select id from public.kategori_kegiatan order by sort_order limit 1)) $$,
  '23514', null::text, 'slug must already be lowercase-and-hyphens'
);
select throws_ok(
  $$ insert into public.kegiatan (judul, slug, tanggal_mulai, tanggal_selesai, kategori_id) values
       ('Kategori Hantu', 'kategori-hantu', '2026-06-01', '2026-06-01', gen_random_uuid()) $$,
  '23503', null::text, 'an unknown kategori_id is refused'
);

select lives_ok(
  $$ insert into public.kegiatan (id, judul, slug, tanggal_mulai, tanggal_selesai, kategori_id, penyelenggara_komisi_id, status) values
       ('2d000000-0000-4000-8000-0000000000a1', 'Rapat Slug', 'rapat-slug', '2026-06-01', '2026-06-01',
        (select id from public.kategori_kegiatan order by sort_order limit 1),
        '2d000000-0000-4000-8000-0000000000f1', 'published') $$,
  'a valid row, with an organizing komisi, passes'
);
select throws_ok(
  $$ update public.kegiatan set slug = 'rapat-slug-baru' where id = '2d000000-0000-4000-8000-0000000000a1' $$,
  '22023', 'Slug kegiatan tidak bisa diubah.', 'slug is immutable'
);
with d as (delete from public.komisi where id = '2d000000-0000-4000-8000-0000000000f1' returning 1)
select is(count(*)::int, 1, 'deleting the organizing komisi is allowed (set null)') from d;
select is(
  (select penyelenggara_komisi_id from public.kegiatan where id = '2d000000-0000-4000-8000-0000000000a1'),
  null, 'penyelenggara_komisi_id is cleared when the komisi is deleted'
);
delete from public.kegiatan where id = '2d000000-0000-4000-8000-0000000000a1';
insert into public.komisi (id, nama, slug, tampil, sort_order) values
  ('2d000000-0000-4000-8000-0000000000f1', 'Komisi Uji Tampil', 'komisi-uji-tampil', true, 0);

-- ---------------------------------------------------------------------------
-- Calendar fixtures, relative to today in Asia/Jakarta.
-- ---------------------------------------------------------------------------
insert into public.kegiatan (id, judul, slug, tanggal_mulai, tanggal_selesai, waktu_mulai, waktu_selesai, tempat, kategori_id, penyelenggara_komisi_id, status)
select v.id::uuid, v.judul, v.slug,
  (case when v.anchor = 'start' then t.this_month_start + v.offset_start else t.last_day_this_month + v.offset_start end),
  (case when v.anchor = 'start' then t.this_month_start + v.offset_end else t.last_day_this_month + v.offset_end end),
  v.waktu_mulai::time, v.waktu_selesai::time, 'Aula Uji', k.id, v.komisi_id::uuid, v.status
from (
  select date_trunc('month', (now() at time zone 'Asia/Jakarta')::date)::date as this_month_start,
    (date_trunc('month', (now() at time zone 'Asia/Jakarta')::date) + interval '1 month' - interval '1 day')::date as last_day_this_month
) as t
cross join (
  values
    ('2d000000-0000-4000-8000-0000000000b1', 'Rapat Bulan Ini', 'rapat-bulan-ini', 'start', 1, 1, '09:00', '11:00', 'published', null),
    ('2d000000-0000-4000-8000-0000000000b2', 'Draft Bulan Ini', 'draft-bulan-ini', 'start', 2, 2, null, null, 'draft', null),
    -- spans the last day of this month into the first day of next month.
    ('2d000000-0000-4000-8000-0000000000b3', 'Retret Lintas Bulan', 'retret-lintas-bulan', 'end', -1, 1, null, null, 'published', '2d000000-0000-4000-8000-0000000000f1'),
    ('2d000000-0000-4000-8000-0000000000b4', 'Acara Dengan Komisi Sembunyi', 'acara-komisi-sembunyi', 'start', 3, 3, null, null, 'published', '2d000000-0000-4000-8000-0000000000f2')
) as v (id, judul, slug, anchor, offset_start, offset_end, waktu_mulai, waktu_selesai, status, komisi_id)
join public.kategori_kegiatan k on k.sort_order = 0;

-- ---------------------------------------------------------------------------
-- kegiatan_bulan: format/range validation, published-only, month overlap
-- ---------------------------------------------------------------------------
select is(
  (select p.prosecdef from pg_proc p where p.oid = 'public.kegiatan_bulan(text)'::regprocedure),
  true, 'kegiatan_bulan is SECURITY DEFINER'
);
select is(
  (select p.proconfig from pg_proc p where p.oid = 'public.kegiatan_bulan(text)'::regprocedure),
  array['search_path=""'], 'kegiatan_bulan runs with an empty search_path'
);
select is((select count(*)::int from public.kegiatan_bulan('2026-13')), 0, 'a malformed month (13) returns no rows, not an error');
select is((select count(*)::int from public.kegiatan_bulan('not-a-month')), 0, 'a non-conforming string returns no rows');
select is((select count(*)::int from public.kegiatan_bulan(null)), 0, 'a null month returns no rows');
select is(
  (select count(*)::int from public.kegiatan_bulan(to_char((now() at time zone 'Asia/Jakarta')::date + interval '25 months', 'YYYY-MM'))),
  0, 'a month 25 months out is outside the +/-24 month window'
);

select results_eq(
  $$ select judul from public.kegiatan_bulan(to_char((now() at time zone 'Asia/Jakarta')::date, 'YYYY-MM')) order by judul $$,
  $$ values ('Acara Dengan Komisi Sembunyi'::text), ('Rapat Bulan Ini'::text), ('Retret Lintas Bulan'::text) $$,
  'this month: only published rows, draft excluded'
);
select ok(
  (select true from public.kegiatan_bulan(to_char((now() at time zone 'Asia/Jakarta')::date + interval '1 month', 'YYYY-MM')) where judul = 'Retret Lintas Bulan'),
  'the cross-month event also shows up in next month (overlap, not containment)'
);
select is(
  (select kategori_nama from public.kegiatan_bulan(to_char((now() at time zone 'Asia/Jakarta')::date, 'YYYY-MM')) where judul = 'Rapat Bulan Ini'),
  'Ibadah khusus', 'kegiatan_bulan joins the category name and color'
);

-- ---------------------------------------------------------------------------
-- kegiatan_detail
-- ---------------------------------------------------------------------------
select is(
  (select p.prosecdef from pg_proc p where p.oid = 'public.kegiatan_detail(text)'::regprocedure),
  true, 'kegiatan_detail is SECURITY DEFINER'
);
select is(public.kegiatan_detail('draft-bulan-ini'), null, 'a draft slug returns null');
select is(public.kegiatan_detail('tidak-ada-begini'), null, 'an unknown slug returns null');
select is(
  (public.kegiatan_detail('rapat-bulan-ini') ->> 'judul'), 'Rapat Bulan Ini',
  'a published slug returns its row as jsonb'
);
select is(
  (public.kegiatan_detail('acara-komisi-sembunyi') ->> 'penyelenggara_komisi_nama'), 'Komisi Uji Sembunyi',
  'the organizing komisi''s name shows regardless of its own tampil flag'
);
select is(
  (public.kegiatan_detail('acara-komisi-sembunyi') ->> 'penyelenggara_komisi_slug'), null,
  'but its slug is withheld when that komisi is itself not tampil (so the link is hidden)'
);
select is(
  (public.kegiatan_detail('retret-lintas-bulan') ->> 'penyelenggara_komisi_slug'), 'komisi-uji-tampil',
  'a tampil komisi''s slug is included'
);

-- ---------------------------------------------------------------------------
-- kegiatan_mendatang
-- ---------------------------------------------------------------------------
select is(
  (select p.prosecdef from pg_proc p where p.oid = 'public.kegiatan_mendatang(int,uuid)'::regprocedure),
  true, 'kegiatan_mendatang is SECURITY DEFINER'
);
insert into public.kegiatan (id, judul, slug, tanggal_mulai, tanggal_selesai, kategori_id, status)
select '2d000000-0000-4000-8000-0000000000c1'::uuid, 'Kemarin Sampai Besok', 'kemarin-sampai-besok',
  t.today - 1, t.today + 1, k.id, 'published'
from (select (now() at time zone 'Asia/Jakarta')::date as today) as t
join public.kategori_kegiatan k on k.sort_order = 0;
insert into public.kegiatan (id, judul, slug, tanggal_mulai, tanggal_selesai, kategori_id, status)
select '2d000000-0000-4000-8000-0000000000c2'::uuid, 'Sudah Lewat', 'sudah-lewat',
  t.today - 5, t.today - 2, k.id, 'published'
from (select (now() at time zone 'Asia/Jakarta')::date as today) as t
join public.kategori_kegiatan k on k.sort_order = 0;

select ok(
  (select true from public.kegiatan_mendatang(10, null) where slug = 'kemarin-sampai-besok'),
  'an event that started yesterday and ends tomorrow still counts as upcoming (tanggal_selesai >= today)'
);
select ok(
  not exists (select 1 from public.kegiatan_mendatang(10, null) where slug = 'sudah-lewat'),
  'an event that already ended is excluded'
);
select ok(
  not exists (select 1 from public.kegiatan_mendatang(10, '2d000000-0000-4000-8000-0000000000c1'::uuid) where slug = 'kemarin-sampai-besok'),
  'p_exclude_id excludes that one event'
);
select is((select count(*)::int from public.kegiatan_mendatang(1, null)), 1, 'p_limit is respected');

-- ---------------------------------------------------------------------------
-- anon: zero direct table access; the three functions still work
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok(
  $$ select * from public.kegiatan $$,
  '42501', null::text, 'anon cannot select kegiatan directly'
);
select throws_ok(
  $$ select * from public.kategori_kegiatan $$,
  '42501', null::text, 'anon cannot select kategori_kegiatan directly'
);
select throws_ok(
  $$ insert into public.kegiatan (judul, slug, tanggal_mulai, tanggal_selesai, kategori_id) values ('Anon', 'anon', '2026-01-01', '2026-01-01', gen_random_uuid()) $$,
  '42501', null::text, 'anon cannot insert kegiatan'
);
select ok(
  (select true from public.kegiatan_bulan(to_char((now() at time zone 'Asia/Jakarta')::date, 'YYYY-MM')) limit 1),
  'anon can still call kegiatan_bulan'
);
select is(
  (public.kegiatan_detail('rapat-bulan-ini') ->> 'judul'), 'Rapat Bulan Ini',
  'anon can still call kegiatan_detail'
);
select ok(
  (select true from public.kegiatan_mendatang(3, null) limit 1),
  'anon can still call kegiatan_mendatang'
);
reset role;

-- ---------------------------------------------------------------------------
-- viewer / editor / admin
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"2d000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;
select ok((select count(*)::int from public.kegiatan) > 0, 'viewer reads kegiatan (draft included)');
with u as (update public.kegiatan set status = 'published' where id = '2d000000-0000-4000-8000-0000000000b2' returning 1)
select is(count(*)::int, 0, 'viewer cannot publish a kegiatan') from u;
with d as (delete from public.kategori_kegiatan where sort_order = 4 returning 1)
select is(count(*)::int, 0, 'viewer cannot delete a kategori') from d;
reset role;

set local request.jwt.claims = '{"sub":"2d000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;
with u as (update public.kegiatan set status = 'published' where id = '2d000000-0000-4000-8000-0000000000b2' returning 1)
select is(count(*)::int, 1, 'editor publishes a kegiatan') from u;
select lives_ok(
  $$ insert into public.kategori_kegiatan (nama, warna, sort_order) values ('Kategori Editor', 'ungu', 99) $$,
  'editor adds a kategori (this module: situs:update covers writes, like kegiatan itself)'
);
with d as (delete from public.kategori_kegiatan where nama = 'Kategori Editor' returning 1)
select is(count(*)::int, 0, 'editor cannot delete a kategori (no situs:delete)') from d;
with d as (delete from public.kegiatan where id = '2d000000-0000-4000-8000-0000000000b1' returning 1)
select is(count(*)::int, 0, 'editor cannot delete a kegiatan') from d;
reset role;

set local request.jwt.claims = '{"sub":"2d000000-0000-4000-8000-000000000003","role":"authenticated"}';
set local role authenticated;
select throws_ok(
  $$ delete from public.kategori_kegiatan where sort_order = 0 $$,
  '23503', null::text, 'admin cannot delete a kategori still used by a kegiatan'
);
with d as (delete from public.kegiatan where id = '2d000000-0000-4000-8000-0000000000b1' returning 1)
select is(count(*)::int, 1, 'admin deletes a kegiatan') from d;
with d as (delete from public.kategori_kegiatan where nama = 'Kategori Editor' returning 1)
select is(count(*)::int, 1, 'admin deletes an unused kategori') from d;
reset role;

select * from finish();
rollback;
