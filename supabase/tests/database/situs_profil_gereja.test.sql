-- Site content permissions, the `situs` bucket, and Profil Gereja (brief §14,
-- §14.1, §14.5; migration 0029).
begin;
create extension if not exists pgtap with schema extensions;

select plan(56);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres). Rolled back at the end.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('29000000-0000-4000-8000-000000000001', 'situs-editor@test.local'),
  ('29000000-0000-4000-8000-000000000002', 'situs-viewer@test.local'),
  ('29000000-0000-4000-8000-000000000003', 'situs-admin@test.local'),
  ('29000000-0000-4000-8000-000000000004', 'situs-super@test.local');

insert into public.user_roles (user_id, role_id)
select v.user_id::uuid, r.id
from (
  values
    ('29000000-0000-4000-8000-000000000001', 'editor'),
    ('29000000-0000-4000-8000-000000000002', 'viewer'),
    ('29000000-0000-4000-8000-000000000003', 'admin'),
    ('29000000-0000-4000-8000-000000000004', 'super_admin')
) as v (user_id, role_name)
join public.roles r on r.name = v.role_name;

-- Objects the server would have uploaded (direct inserts as postgres).
insert into storage.objects (bucket_id, name) values
  ('situs', 'profil/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1.jpg'),
  ('situs', 'profil/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2.png');

-- ---------------------------------------------------------------------------
-- Permissions (brief §14)
-- ---------------------------------------------------------------------------
select results_eq(
  $$ select r.name, p.resource || ':' || p.action
     from public.role_permissions rp
     join public.roles r on r.id = rp.role_id
     join public.permissions p on p.id = rp.permission_id
     where p.resource in ('situs', 'situs_rekening')
       and r.name in ('super_admin', 'admin', 'editor', 'viewer')
     order by r.name, (p.resource || ':' || p.action) collate "C" $$,
  $$ values
     ('admin', 'situs:create'), ('admin', 'situs:delete'), ('admin', 'situs:read'), ('admin', 'situs:update'),
     ('admin', 'situs_rekening:update'),
     ('editor', 'situs:create'), ('editor', 'situs:read'), ('editor', 'situs:update'),
     ('super_admin', 'situs:create'), ('super_admin', 'situs:delete'), ('super_admin', 'situs:read'),
     ('super_admin', 'situs:update'), ('super_admin', 'situs_rekening:update'),
     ('viewer', 'situs:read') $$,
  'situs and situs_rekening are seeded per brief §14'
);

-- ---------------------------------------------------------------------------
-- Bucket
-- ---------------------------------------------------------------------------
select results_eq(
  $$ select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'situs' $$,
  $$ values (true, 5242880::bigint, array['image/jpeg', 'image/png', 'image/webp']) $$,
  'bucket situs: public read, 5 MB, JPEG/PNG/WebP only'
);
select is(
  (select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects'
     and (qual like '%situs%' or with_check like '%situs%')),
  0, 'no storage policy mentions the situs bucket'
);

-- ---------------------------------------------------------------------------
-- Singletons (as postgres)
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.profil_gereja (id) values (2) $$,
  '23514', null::text, 'profil_gereja: a second row with another id is refused'
);
select throws_ok(
  $$ insert into public.profil_gereja (id) values (1) $$,
  '23505', null::text, 'profil_gereja: a second row with id 1 is refused'
);
select throws_ok(
  $$ insert into public.profil_gereja_rekening (id) values (2) $$,
  '23514', null::text, 'profil_gereja_rekening: a second row is refused'
);

-- ---------------------------------------------------------------------------
-- Field rules (as postgres, so only the constraints and triggers apply)
-- ---------------------------------------------------------------------------
select throws_ok($$ update public.profil_gereja set telepon = '0812-3456' $$, '23514', null::text, 'telepon: digits only');
select throws_ok($$ update public.profil_gereja set telepon = '1234567' $$, '23514', null::text, 'telepon: at least 8 digits');
select lives_ok($$ update public.profil_gereja set telepon = '081234567890' $$, 'telepon: 12 digits pass');
select throws_ok($$ update public.profil_gereja set hero_judul = '   ' $$, '23514', null::text, 'blank text is refused (null instead)');
select throws_ok($$ update public.profil_gereja set email = 'bukan-email' $$, '23514', null::text, 'email format');

select throws_ok(
  $$ update public.profil_gereja set maps_url = 'https://evil.example/maps' $$,
  '23514', null::text, 'maps_url: another host is refused'
);
select throws_ok(
  $$ update public.profil_gereja set maps_url = 'https://google.com.evil.example/maps' $$,
  '23514', null::text, 'maps_url: google.com as a subdomain of another host is refused'
);
select throws_ok(
  $$ update public.profil_gereja set maps_url = 'http://www.google.com/maps/place/x' $$,
  '23514', null::text, 'maps_url: http is refused'
);
select throws_ok(
  $$ update public.profil_gereja set maps_url = 'https://www.google.com/search?q=maps' $$,
  '23514', null::text, 'maps_url: a google.com path other than /maps is refused'
);
select lives_ok(
  $$ update public.profil_gereja set maps_url = 'https://www.google.com/maps/place/Rangkasbitung' $$,
  'maps_url: www.google.com/maps passes'
);
select lives_ok(
  $$ update public.profil_gereja set maps_url = 'https://maps.app.goo.gl/AbCdEf123' $$,
  'maps_url: maps.app.goo.gl passes'
);

select throws_ok(
  $$ update public.profil_gereja set instagram_url = 'https://instagram.com.evil.example/akun' $$,
  '23514', null::text, 'instagram_url: a lookalike host is refused'
);
select throws_ok(
  $$ update public.profil_gereja set instagram_url = 'https://instagram.com@evil.example/akun' $$,
  '23514', null::text, 'instagram_url: userinfo tricks are refused'
);
select throws_ok(
  $$ update public.profil_gereja set instagram_url = 'http://www.instagram.com/akun' $$,
  '23514', null::text, 'instagram_url: http is refused'
);
select throws_ok(
  $$ update public.profil_gereja set youtube_url = 'https://www.instagram.com/akun' $$,
  '23514', null::text, 'youtube_url: another platform''s host is refused'
);
select throws_ok(
  $$ update public.profil_gereja set facebook_url = 'javascript:alert(1)//facebook.com/x' $$,
  '23514', null::text, 'facebook_url: another scheme is refused'
);
select lives_ok(
  $$ update public.profil_gereja set instagram_url = 'https://www.instagram.com/akun',
       youtube_url = 'https://www.youtube.com/@kanal', facebook_url = 'https://www.facebook.com/halaman' $$,
  'social URLs on their own hosts pass'
);

select throws_ok(
  $$ update public.profil_gereja set misi = array['Misi satu', '  '] $$,
  '23514', null::text, 'misi: a blank line is refused'
);
select lives_ok($$ update public.profil_gereja set misi = array['Misi satu', 'Misi dua'] $$, 'misi: lines pass');

select throws_ok(
  $$ update public.profil_gereja set hero_foto_path = 'profil/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1.jpg' $$,
  '23514', null::text, 'a photo without alt text is refused'
);
select throws_ok(
  $$ update public.profil_gereja set hero_foto_path = '../rahasia.jpg', hero_foto_alt = 'Alt' $$,
  '23514', null::text, 'a photo path not in the server''s format is refused'
);
select throws_ok(
  $$ update public.profil_gereja set hero_foto_path = 'profil/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1.jpg', hero_foto_alt = 'Alt' $$,
  '22023', 'Foto tidak ditemukan di penyimpanan.', 'a path with no object in the bucket is refused'
);
select lives_ok(
  $$ update public.profil_gereja set hero_foto_path = 'profil/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1.jpg', hero_foto_alt = 'Gedung gereja' $$,
  'a path whose object exists, with alt text, passes'
);
select throws_ok(
  $$ update public.profil_gereja_rekening set nama_bank = 'Bank Contoh' $$,
  '23514', null::text, 'rekening: all three account fields or none'
);

-- ---------------------------------------------------------------------------
-- anon: no table access, only the public function
-- ---------------------------------------------------------------------------
set local role anon;

select throws_ok($$ select * from public.profil_gereja $$, '42501', null::text, 'anon cannot select profil_gereja');
select throws_ok($$ select * from public.profil_gereja_rekening $$, '42501', null::text, 'anon cannot select profil_gereja_rekening');
select throws_ok($$ select * from public.profil_gereja_linimasa $$, '42501', null::text, 'anon cannot select profil_gereja_linimasa');
select is(
  (select array_agg(k order by k) from jsonb_object_keys(public.public_profil_gereja()) as k),
  array[
    'alamat', 'atas_nama', 'email', 'facebook_url', 'hero_foto_alt', 'hero_foto_path', 'hero_judul',
    'hero_subjudul', 'instagram_url', 'jam_sekretariat', 'linimasa', 'maps_url', 'misi', 'nama_bank',
    'nomor_rekening', 'qris_foto_alt', 'qris_foto_path', 'sambutan_pendeta_foto_alt', 'sambutan_pendeta_foto_path',
    'sambutan_pendeta_nama', 'sambutan_pendeta_peran', 'sambutan_teks', 'sejarah', 'sejarah_foto_alt', 'sejarah_foto_path',
    'telepon', 'visi', 'youtube_url'
  ],
  'anon: public_profil_gereja returns exactly the public fields (no updated_at)'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('situs', 'profil/anon.jpg') $$,
  '42501', null::text, 'anon cannot write to the situs bucket'
);
select throws_ok(
  $$ select public.situs_referenced_photo_paths() $$,
  '42501', null::text, 'anon cannot list referenced paths'
);
reset role;

-- ---------------------------------------------------------------------------
-- viewer: reads, can't write
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"29000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;

select is((select count(*)::int from public.profil_gereja), 1, 'viewer reads profil_gereja');
with u as (update public.profil_gereja set hero_judul = 'Viewer' returning 1)
select is(count(*)::int, 0, 'viewer cannot update profil_gereja') from u;
select throws_ok(
  $$ insert into public.profil_gereja_linimasa (tahun, teks) values ('2000', 'Viewer') $$,
  '42501', null::text, 'viewer cannot add a linimasa item'
);
select throws_ok(
  $$ select public.reorder_profil_linimasa(array[]::uuid[]) $$,
  '42501', null::text, 'viewer cannot reorder linimasa'
);
reset role;

-- ---------------------------------------------------------------------------
-- editor: content yes, rekening no (brief §14.1), storage no
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"29000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

with u as (update public.profil_gereja set hero_judul = 'Judul Editor' returning 1)
select is(count(*)::int, 1, 'editor updates profil_gereja') from u;
with u as (
  update public.profil_gereja_rekening
  set nama_bank = 'Bank Editor', nomor_rekening = '1234567890', atas_nama = 'Editor' returning 1
)
select is(count(*)::int, 0, 'editor cannot update rekening directly (situs_rekening:update)') from u;
select throws_ok(
  $$ select public.update_profil_gereja_rekening('Bank Editor', '1234567890', 'Editor') $$,
  '42501', null::text, 'editor cannot update rekening through the RPC'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('situs', 'profil/editor.jpg') $$,
  '42501', null::text, 'editor cannot write to the situs bucket directly'
);
select is(
  (select count(*)::int from storage.objects where bucket_id = 'situs'),
  0, 'editor cannot list the situs bucket'
);
select lives_ok(
  $$ insert into public.profil_gereja_linimasa (id, tahun, teks, sort_order) values
       ('29000000-0000-4000-8000-0000000000a1', '1950-an', 'Awal persekutuan (uji)', 0),
       ('29000000-0000-4000-8000-0000000000a2', '1970', 'Peristiwa kedua (uji)', 1) $$,
  'editor adds linimasa items (situs:create)'
);
with d as (delete from public.profil_gereja_linimasa where id = '29000000-0000-4000-8000-0000000000a1' returning 1)
select is(count(*)::int, 0, 'editor cannot delete a linimasa item (no situs:delete)') from d;
select throws_ok(
  $$ select public.reorder_profil_linimasa(array['29000000-0000-4000-8000-0000000000a2']::uuid[]) $$,
  '22023', 'Daftar linimasa sudah berubah. Muat ulang halaman lalu coba lagi.',
  'reorder refuses a list that is not the current set'
);
select lives_ok(
  $$ select public.reorder_profil_linimasa(array['29000000-0000-4000-8000-0000000000a2', '29000000-0000-4000-8000-0000000000a1']::uuid[]) $$,
  'reorder with the current set passes'
);
select results_eq(
  $$ select id from public.profil_gereja_linimasa order by sort_order $$,
  $$ values ('29000000-0000-4000-8000-0000000000a2'::uuid), ('29000000-0000-4000-8000-0000000000a1'::uuid) $$,
  'reorder saved sort_order = position'
);
select results_eq(
  $$ select public.situs_referenced_photo_paths() $$,
  $$ values ('profil/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1.jpg'::text) $$,
  'referenced paths: the hero photo'
);
reset role;

-- ---------------------------------------------------------------------------
-- admin: rekening through the RPC, old and new values returned
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"29000000-0000-4000-8000-000000000003","role":"authenticated"}';
set local role authenticated;

select is(
  public.update_profil_gereja_rekening(
    'Bank Contoh', '123 456 7890', 'Contoh Atas Nama',
    'profil/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2.png', 'Kode QRIS'
  ),
  jsonb_build_object(
    'old', jsonb_build_object('nama_bank', null, 'nomor_rekening', null, 'atas_nama', null, 'qris_foto_path', null, 'qris_foto_alt', null),
    'new', jsonb_build_object(
      'nama_bank', 'Bank Contoh', 'nomor_rekening', '123 456 7890', 'atas_nama', 'Contoh Atas Nama',
      'qris_foto_path', 'profil/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2.png', 'qris_foto_alt', 'Kode QRIS'
    )
  ),
  'admin updates rekening; the RPC returns old and new values'
);
select is(
  (select nama_bank from public.profil_gereja_rekening),
  'Bank Contoh', 'admin: rekening saved'
);
reset role;

-- anon sees the saved values, and nothing else.
set local role anon;
select is(
  public.public_profil_gereja() ->> 'nomor_rekening',
  '123 456 7890', 'anon: the public function returns the saved rekening'
);
reset role;

-- ---------------------------------------------------------------------------
-- Roles & Permissions: the permission editor now covers situs
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"29000000-0000-4000-8000-000000000004","role":"authenticated"}';
set local role authenticated;

select lives_ok(
  $$ select public.set_role_ui_permissions(
       (select id from public.roles where name = 'viewer'),
       array(
         select p.id from public.permissions p
         where (p.resource = 'warta' and p.action = 'read')
            or (p.resource = 'situs' and p.action in ('read', 'update'))
       )
     ) $$,
  'set_role_ui_permissions accepts situs permissions'
);
select results_eq(
  $$ select p.action from public.role_permissions rp
     join public.permissions p on p.id = rp.permission_id
     join public.roles r on r.id = rp.role_id
     where r.name = 'viewer' and p.resource = 'situs' order by 1 $$,
  $$ values ('read'::text), ('update'::text) $$,
  'viewer now has situs:read and situs:update'
);
reset role;

select * from finish();
rollback;
