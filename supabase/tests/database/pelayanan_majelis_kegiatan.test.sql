-- Pelayanan, Majelis, Kegiatan (brief §14.2-14.4; migration 0030).
begin;
create extension if not exists pgtap with schema extensions;

select plan(37);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres). Rolled back at the end.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('2b000000-0000-4000-8000-000000000001', 'pmk-editor@test.local'),
  ('2b000000-0000-4000-8000-000000000002', 'pmk-viewer@test.local'),
  ('2b000000-0000-4000-8000-000000000003', 'pmk-admin@test.local');

insert into public.user_roles (user_id, role_id)
select v.user_id::uuid, r.id
from (
  values
    ('2b000000-0000-4000-8000-000000000001', 'editor'),
    ('2b000000-0000-4000-8000-000000000002', 'viewer'),
    ('2b000000-0000-4000-8000-000000000003', 'admin')
) as v (user_id, role_name)
join public.roles r on r.name = v.role_name;

-- Objects the server would have uploaded (direct inserts as postgres).
insert into storage.objects (bucket_id, name) values
  ('situs', 'majelis/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1.jpg'),
  ('situs', 'kegiatan/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2.jpg');

-- ---------------------------------------------------------------------------
-- Field rules (as postgres, so only the constraints and triggers apply)
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.pelayanan (nama, icon) values ('Sekolah Minggu', 'NotAnIcon') $$,
  '23514', null::text, 'pelayanan.icon: only the fixed list of keys is accepted'
);
select lives_ok(
  $$ insert into public.pelayanan (id, nama, icon, sort_order) values
       ('2b000000-0000-4000-8000-0000000000a1', 'Sekolah Minggu', 'Baby', 0) $$,
  'pelayanan.icon: a listed key passes'
);
select throws_ok(
  $$ insert into public.majelis (nama, jabatan, foto_path) values ('Pdt. Contoh', 'Pendeta', 'majelis/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1.jpg') $$,
  '23514', null::text, 'majelis: a photo without alt text is refused'
);
select throws_ok(
  $$ insert into public.majelis (nama, jabatan, foto_path, foto_alt) values
       ('Pdt. Contoh', 'Pendeta', 'majelis/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg', 'Foto') $$,
  '22023', 'Foto tidak ditemukan di penyimpanan.', 'majelis: a path with no object in the bucket is refused'
);
select lives_ok(
  $$ insert into public.majelis (id, nama, jabatan, foto_path, foto_alt, sort_order) values
       ('2b000000-0000-4000-8000-0000000000b1', 'Pdt. Contoh', 'Pendeta Jemaat', 'majelis/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1.jpg', 'Foto pendeta', 0) $$,
  'majelis: a path whose object exists, with alt text, passes'
);
select throws_ok(
  $$ insert into public.kegiatan (judul, tanggal, status) values ('Retret', '2026-10-04', 'archived') $$,
  '23514', null::text, 'kegiatan.status: only draft/published is accepted'
);
select lives_ok(
  $$ insert into public.kegiatan (id, judul, tanggal, foto_path, foto_alt, status) values
       ('2b000000-0000-4000-8000-0000000000c1', 'Retret Pemuda', '2026-10-04', 'kegiatan/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2.jpg', 'Retret', 'published') $$,
  'kegiatan: valid row passes, default status is draft otherwise'
);
select lives_ok(
  $$ insert into public.kegiatan (id, judul, tanggal) values ('2b000000-0000-4000-8000-0000000000c9', 'Tanpa status', '2026-10-04') $$,
  'kegiatan: status can be omitted'
);
select is(
  (select status from public.kegiatan where id = '2b000000-0000-4000-8000-0000000000c9'),
  'draft', 'kegiatan.status defaults to draft'
);
delete from public.kegiatan where id = '2b000000-0000-4000-8000-0000000000c9';

-- ---------------------------------------------------------------------------
-- anon: only active/published rows, no direct writes
-- ---------------------------------------------------------------------------
insert into public.pelayanan (id, nama, icon, aktif, sort_order) values
  ('2b000000-0000-4000-8000-0000000000a2', 'Persekutuan Pria', 'Users', false, 1);
insert into public.majelis (id, nama, jabatan, aktif, sort_order) values
  ('2b000000-0000-4000-8000-0000000000b2', 'Nonaktif', 'Mantan Majelis', false, 1);
insert into public.kegiatan (id, judul, tanggal, status) values
  ('2b000000-0000-4000-8000-0000000000c2', 'Rapat Internal (draft)', '2026-10-05', 'draft');

set local role anon;
select results_eq(
  $$ select nama from public.pelayanan order by nama $$,
  $$ values ('Sekolah Minggu'::text) $$,
  'anon sees only aktif pelayanan'
);
select results_eq(
  $$ select nama from public.majelis order by nama $$,
  $$ values ('Pdt. Contoh'::text) $$,
  'anon sees only aktif majelis'
);
select results_eq(
  $$ select judul from public.kegiatan order by judul $$,
  $$ values ('Retret Pemuda'::text) $$,
  'anon sees only published kegiatan (draft hidden)'
);
select throws_ok(
  $$ insert into public.pelayanan (nama, icon) values ('Anon', 'Users') $$,
  '42501', null::text, 'anon cannot insert pelayanan'
);
select throws_ok(
  $$ insert into public.majelis (nama, jabatan) values ('Anon', 'X') $$,
  '42501', null::text, 'anon cannot insert majelis'
);
select throws_ok(
  $$ insert into public.kegiatan (judul, tanggal) values ('Anon', '2026-10-06') $$,
  '42501', null::text, 'anon cannot insert kegiatan'
);
select throws_ok(
  $$ select public.reorder_pelayanan(array[]::uuid[]) $$,
  '42501', null::text, 'anon cannot reorder pelayanan'
);
reset role;

-- ---------------------------------------------------------------------------
-- viewer: reads, can't write
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"2b000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;

select is((select count(*)::int from public.pelayanan), 2, 'viewer reads every pelayanan row (active and inactive)');
with u as (update public.pelayanan set nama = 'Viewer' where id = '2b000000-0000-4000-8000-0000000000a1' returning 1)
select is(count(*)::int, 0, 'viewer cannot update pelayanan') from u;
with u as (update public.majelis set nama = 'Viewer' where id = '2b000000-0000-4000-8000-0000000000b1' returning 1)
select is(count(*)::int, 0, 'viewer cannot update majelis') from u;
with u as (update public.kegiatan set status = 'published' where id = '2b000000-0000-4000-8000-0000000000c2' returning 1)
select is(count(*)::int, 0, 'viewer cannot publish kegiatan') from u;
with d as (delete from public.pelayanan where id = '2b000000-0000-4000-8000-0000000000a1' returning 1)
select is(count(*)::int, 0, 'viewer cannot delete pelayanan') from d;
reset role;

-- ---------------------------------------------------------------------------
-- editor: read/update on all three (situs:update covers writes and adds,
-- per this stage's mapping); reorder; no delete
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"2b000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

with u as (update public.pelayanan set nama = 'Sekolah Minggu (edit)' where id = '2b000000-0000-4000-8000-0000000000a1' returning 1)
select is(count(*)::int, 1, 'editor updates pelayanan') from u;
select lives_ok(
  $$ insert into public.majelis (id, nama, jabatan, sort_order) values ('2b000000-0000-4000-8000-0000000000b3', 'Majelis Baru', 'Diaken', 2) $$,
  'editor adds a majelis row (this stage: situs:update, not situs:create)'
);
with u as (update public.kegiatan set status = 'published' where id = '2b000000-0000-4000-8000-0000000000c2' returning 1)
select is(count(*)::int, 1, 'editor publishes kegiatan') from u;
with d as (delete from public.pelayanan where id = '2b000000-0000-4000-8000-0000000000a2' returning 1)
select is(count(*)::int, 0, 'editor cannot delete pelayanan (no situs:delete)') from d;
with d as (delete from public.majelis where id = '2b000000-0000-4000-8000-0000000000b2' returning 1)
select is(count(*)::int, 0, 'editor cannot delete majelis') from d;
with d as (delete from public.kegiatan where id = '2b000000-0000-4000-8000-0000000000c1' returning 1)
select is(count(*)::int, 0, 'editor cannot delete kegiatan') from d;

select throws_ok(
  $$ select public.reorder_pelayanan(array['2b000000-0000-4000-8000-0000000000a1']::uuid[]) $$,
  '22023', 'Daftar pelayanan sudah berubah. Muat ulang halaman lalu coba lagi.',
  'reorder_pelayanan refuses a list that is not the current set'
);
select lives_ok(
  $$ select public.reorder_pelayanan(array['2b000000-0000-4000-8000-0000000000a2', '2b000000-0000-4000-8000-0000000000a1']::uuid[]) $$,
  'reorder_pelayanan with the current set passes'
);
select results_eq(
  $$ select id from public.pelayanan order by sort_order $$,
  $$ values ('2b000000-0000-4000-8000-0000000000a2'::uuid), ('2b000000-0000-4000-8000-0000000000a1'::uuid) $$,
  'reorder_pelayanan saved sort_order = position'
);
select throws_ok(
  $$ select public.reorder_majelis(array['2b000000-0000-4000-8000-0000000000b1']::uuid[]) $$,
  '22023', 'Daftar majelis sudah berubah. Muat ulang halaman lalu coba lagi.',
  'reorder_majelis refuses a list that is not the current set'
);
select lives_ok(
  $$ select public.reorder_majelis(array[
       '2b000000-0000-4000-8000-0000000000b3', '2b000000-0000-4000-8000-0000000000b2', '2b000000-0000-4000-8000-0000000000b1'
     ]::uuid[]) $$,
  'reorder_majelis with the current set passes'
);
select results_eq(
  $$ select id from public.majelis order by sort_order $$,
  $$ values
     ('2b000000-0000-4000-8000-0000000000b3'::uuid),
     ('2b000000-0000-4000-8000-0000000000b2'::uuid),
     ('2b000000-0000-4000-8000-0000000000b1'::uuid) $$,
  'reorder_majelis saved sort_order = position'
);
reset role;

-- ---------------------------------------------------------------------------
-- admin: delete allowed
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"2b000000-0000-4000-8000-000000000003","role":"authenticated"}';
set local role authenticated;

with d as (delete from public.pelayanan where id = '2b000000-0000-4000-8000-0000000000a2' returning 1)
select is(count(*)::int, 1, 'admin deletes pelayanan') from d;
with d as (delete from public.majelis where id = '2b000000-0000-4000-8000-0000000000b2' returning 1)
select is(count(*)::int, 1, 'admin deletes majelis') from d;
with d as (delete from public.kegiatan where id = '2b000000-0000-4000-8000-0000000000c2' returning 1)
select is(count(*)::int, 1, 'admin deletes kegiatan') from d;
reset role;

-- ---------------------------------------------------------------------------
-- situs_referenced_photo_paths() includes majelis and kegiatan (0030)
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"2b000000-0000-4000-8000-000000000003","role":"authenticated"}';
set local role authenticated;
select results_eq(
  $$ select public.situs_referenced_photo_paths() order by 1 $$,
  $$ values
     ('kegiatan/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2.jpg'::text),
     ('majelis/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1.jpg'::text) $$,
  'referenced paths include the surviving majelis and kegiatan photos'
);
reset role;

select * from finish();
rollback;
