-- Komisi (brief §14.8; migration 0032).
begin;
create extension if not exists pgtap with schema extensions;

select plan(66);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres). Rolled back at the end.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('6a000000-0000-4000-8000-000000000001', 'komisi-editor@test.local'),
  ('6a000000-0000-4000-8000-000000000002', 'komisi-viewer@test.local'),
  ('6a000000-0000-4000-8000-000000000003', 'komisi-admin@test.local'),
  ('6a000000-0000-4000-8000-000000000004', 'komisi-custom@test.local');

insert into public.user_roles (user_id, role_id)
select v.user_id::uuid, r.id
from (
  values
    ('6a000000-0000-4000-8000-000000000001', 'editor'),
    ('6a000000-0000-4000-8000-000000000002', 'viewer'),
    ('6a000000-0000-4000-8000-000000000003', 'admin')
) as v (user_id, role_name)
join public.roles r on r.name = v.role_name;

-- A custom role with situs:update but no warta:read, for the "manage anggota
-- needs both" rule (no seeded role is missing warta:read, brief §4).
insert into public.roles (id, name) values ('6a000000-0000-4000-8000-0000000000e1', 'komisi_uji_role');
insert into public.role_permissions (role_id, permission_id)
select '6a000000-0000-4000-8000-0000000000e1', id from public.permissions where resource = 'situs' and action in ('create', 'update', 'delete');
insert into public.user_roles (user_id, role_id) values ('6a000000-0000-4000-8000-000000000004', '6a000000-0000-4000-8000-0000000000e1');

insert into public.jemaat (id, nama, status_keanggotaan) values
  ('6a000000-0000-4000-8000-0000000000a1', 'Uji Penatua Satu', 'anggota_penuh'),
  ('6a000000-0000-4000-8000-0000000000a2', 'Uji Penatua Dua', 'sidi'),
  ('6a000000-0000-4000-8000-0000000000a3', 'Uji Sidi', 'sidi'),
  ('6a000000-0000-4000-8000-0000000000a4', 'Uji Anggota Penuh', 'anggota_penuh'),
  ('6a000000-0000-4000-8000-0000000000a5', 'Uji Anggota Penuh Dua', 'anggota_penuh'),
  ('6a000000-0000-4000-8000-0000000000a6', 'Uji Simpatisan', 'simpatisan'),
  ('6a000000-0000-4000-8000-0000000000a7', 'Uji Baptis Anak', 'baptis_anak'),
  ('6a000000-0000-4000-8000-0000000000a8', 'Uji Dihapus', 'sidi');

-- "Uji Penatua Satu" carries the Penatua label; "Uji Penatua Dua" does not.
insert into public.jemaat_labels (jemaat_id, label_id)
select '6a000000-0000-4000-8000-0000000000a1', pembina_label_id from public.komisi_settings where id = 1;

insert into storage.objects (bucket_id, name) values
  ('situs', 'komisi/dddddddd-dddd-4ddd-8ddd-dddddddddda1.jpg');

-- ---------------------------------------------------------------------------
-- komisi_settings: the Penatua label is resolved as data, not a name in code
-- ---------------------------------------------------------------------------
select isnt(
  (select pembina_label_id from public.komisi_settings where id = 1),
  null::uuid,
  'komisi_settings has a pembina_label_id after 0032 (the Penatua label was created or found)'
);
select is(
  (select nama from public.label_jemaat where id = (select pembina_label_id from public.komisi_settings where id = 1)),
  'Penatua',
  'the configured label is named Penatua'
);

-- ---------------------------------------------------------------------------
-- jabatan_komisi: seed + RLS
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from public.jabatan_komisi),
  5,
  'jabatan_komisi is seeded with 5 rows'
);
select is(
  (select array_agg(nama order by sort_order) from public.jabatan_komisi),
  array['Ketua', 'Wakil Ketua', 'Sekretaris', 'Bendahara', 'Anggota'],
  'seeded jabatan are in the brief''s order'
);
select is(
  (select tunggal from public.jabatan_komisi where nama = 'Anggota'),
  false,
  'Anggota is not tunggal'
);

set local request.jwt.claims = '{"sub":"6a000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;
select is((select count(*)::int from public.jabatan_komisi), 5, 'viewer reads jabatan_komisi');
select throws_ok(
  $$ insert into public.jabatan_komisi (nama) values ('Uji Jabatan Viewer') $$,
  '42501', null::text, 'viewer cannot insert jabatan_komisi'
);
reset role;

set local request.jwt.claims = '{"sub":"6a000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;
select lives_ok(
  $$ insert into public.jabatan_komisi (id, nama, sort_order) values ('6a000000-0000-4000-8000-0000000000f1', 'Uji Jabatan Tak Dipakai', 5) $$,
  'editor (situs:create) adds a jabatan'
);
reset role;

-- ---------------------------------------------------------------------------
-- komisi: nama uniqueness, slug format/immutability, pembina label check
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ insert into public.komisi (id, nama, slug, pembina_jemaat_id) values
       ('6a000000-0000-4000-8000-0000000000b1', 'Komisi Uji Satu', 'komisi-uji-satu', '6a000000-0000-4000-8000-0000000000a1') $$,
  'a komisi with a Penatua-labelled pembina is accepted'
);
select throws_ok(
  $$ insert into public.komisi (nama, slug, pembina_jemaat_id) values
       ('Komisi Uji Tanpa Label', 'komisi-uji-tanpa-label', '6a000000-0000-4000-8000-0000000000a2') $$,
  '22023', 'Pembina harus berlabel Penatua.', 'a pembina without the Penatua label is rejected'
);
select lives_ok(
  $$ insert into public.komisi (nama, slug) values ('Komisi Uji Tanpa Pembina', 'komisi-uji-tanpa-pembina') $$,
  'a komisi with no pembina at all is accepted'
);
select throws_ok(
  $$ insert into public.komisi (nama, slug) values ('Komisi Uji Satu', 'komisi-uji-satu-lagi') $$,
  '23505', null::text, 'a case-sensitive duplicate nama is rejected'
);
select throws_ok(
  $$ insert into public.komisi (nama, slug) values ('komisi uji SATU', 'komisi-uji-satu-lagi-2') $$,
  '23505', null::text, 'a case-insensitive duplicate nama is rejected'
);
select throws_ok(
  $$ insert into public.komisi (nama, slug) values ('Komisi Slug Salah', 'Slug Tidak Valid') $$,
  '23514', null::text, 'a malformed slug is rejected'
);
select throws_ok(
  $$ update public.komisi set slug = 'slug-baru' where id = '6a000000-0000-4000-8000-0000000000b1' $$,
  '22023', 'Slug komisi tidak bisa diubah.', 'the slug cannot be changed after creation'
);
select throws_ok(
  $$ insert into public.komisi (nama, slug, foto_path) values
       ('Komisi Uji Foto Hilang', 'komisi-uji-foto-hilang', 'komisi/dddddddd-dddd-4ddd-8ddd-dddddddddda1.jpg') $$,
  '23514', null::text, 'a photo path without alt text is rejected'
);
select throws_ok(
  $$ insert into public.komisi (nama, slug, foto_path, foto_alt) values
       ('Komisi Uji Foto Hilang 2', 'komisi-uji-foto-hilang-2', 'komisi/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1.jpg', 'Foto') $$,
  '22023', 'Foto tidak ditemukan di penyimpanan.', 'a photo path with no object in the bucket is rejected'
);
select lives_ok(
  $$ insert into public.komisi (nama, slug, foto_path, foto_alt) values
       ('Komisi Uji Foto', 'komisi-uji-foto', 'komisi/dddddddd-dddd-4ddd-8ddd-dddddddddda1.jpg', 'Foto komisi') $$,
  'a valid photo path with alt text is accepted'
);

-- RLS: viewer reads, cannot write; editor can insert/update (situs:create/update) but not delete; admin can delete
set local request.jwt.claims = '{"sub":"6a000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;
select is((select count(*)::int from public.komisi), 3, 'viewer reads komisi');
select throws_ok(
  $$ insert into public.komisi (nama, slug) values ('Komisi Uji Viewer', 'komisi-uji-viewer') $$,
  '42501', null::text, 'viewer cannot insert komisi'
);
-- RLS denies by filtering rows, not raising (same convention as master_data.test.sql/sarana_dana.test.sql).
with d as (update public.komisi set tampil = false where id = '6a000000-0000-4000-8000-0000000000b1' returning 1)
select is(count(*)::int, 0, 'viewer cannot update komisi (0 rows affected, not an exception)') from d;
reset role;

set local request.jwt.claims = '{"sub":"6a000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;
select lives_ok(
  $$ update public.komisi set deskripsi = 'Deskripsi baru' where id = '6a000000-0000-4000-8000-0000000000b1' $$,
  'editor (situs:update) updates a komisi'
);
with d as (delete from public.komisi where id = '6a000000-0000-4000-8000-0000000000b1' returning 1)
select is(count(*)::int, 0, 'editor cannot delete a komisi (0 rows affected, no matching policy)') from d;
reset role;

set local request.jwt.claims = '{"sub":"6a000000-0000-4000-8000-000000000003","role":"authenticated"}';
set local role authenticated;
select lives_ok(
  $$ select public.reorder_komisi(array(select id from public.komisi order by sort_order)) $$,
  'admin reorders the full, current set of komisi'
);
select throws_ok(
  $$ select public.reorder_komisi('{}') $$,
  '22023', 'Daftar komisi sudah berubah. Muat ulang halaman lalu coba lagi.', 'reorder_komisi rejects a stale (incomplete) list'
);
reset role;

set local request.jwt.claims = '{"sub":"6a000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;
select throws_ok(
  $$ select public.reorder_komisi('{}') $$,
  '42501', null::text, 'viewer cannot call reorder_komisi'
);
reset role;

-- ---------------------------------------------------------------------------
-- komisi_anggota: status eligibility, tunggal jabatan, duplicates
-- ---------------------------------------------------------------------------
select id as ketua_id from public.jabatan_komisi where nama = 'Ketua' \gset
select id as anggota_jabatan_id from public.jabatan_komisi where nama = 'Anggota' \gset
select id as komisi_satu from public.komisi where slug = 'komisi-uji-satu' \gset
select id as komisi_dua from public.komisi where slug = 'komisi-uji-tanpa-pembina' \gset

select throws_ok(
  format($$ insert into public.komisi_anggota (komisi_id, jemaat_id, jabatan_id) values
       ('%s', '6a000000-0000-4000-8000-0000000000a6', '%s') $$, :'komisi_satu', :'anggota_jabatan_id'),
  '22023', 'Anggota komisi harus berstatus Sidi atau Anggota Penuh.', 'a simpatisan member is rejected'
);
select throws_ok(
  format($$ insert into public.komisi_anggota (komisi_id, jemaat_id, jabatan_id) values
       ('%s', '6a000000-0000-4000-8000-0000000000a7', '%s') $$, :'komisi_satu', :'anggota_jabatan_id'),
  '22023', 'Anggota komisi harus berstatus Sidi atau Anggota Penuh.', 'a baptis_anak member is rejected'
);
select lives_ok(
  format($$ insert into public.komisi_anggota (komisi_id, jemaat_id, jabatan_id) values
       ('%s', '6a000000-0000-4000-8000-0000000000a3', '%s') $$, :'komisi_satu', :'ketua_id'),
  'a Sidi member as Ketua is accepted'
);
select throws_ok(
  format($$ insert into public.komisi_anggota (komisi_id, jemaat_id, jabatan_id) values
       ('%s', '6a000000-0000-4000-8000-0000000000a4', '%s') $$, :'komisi_satu', :'ketua_id'),
  '23505', null::text, 'a second Ketua in the same komisi is rejected'
);
select lives_ok(
  format($$ insert into public.komisi_anggota (komisi_id, jemaat_id, jabatan_id) values
       ('%s', '6a000000-0000-4000-8000-0000000000a4', '%s') $$, :'komisi_satu', :'anggota_jabatan_id'),
  'the first Anggota (non-tunggal) is accepted'
);
select lives_ok(
  format($$ insert into public.komisi_anggota (komisi_id, jemaat_id, jabatan_id) values
       ('%s', '6a000000-0000-4000-8000-0000000000a5', '%s') $$, :'komisi_satu', :'anggota_jabatan_id'),
  'a second Anggota (non-tunggal) in the same komisi is accepted'
);
select throws_ok(
  format($$ insert into public.komisi_anggota (komisi_id, jemaat_id, jabatan_id) values
       ('%s', '6a000000-0000-4000-8000-0000000000a3', '%s') $$, :'komisi_satu', :'anggota_jabatan_id'),
  '23505', null::text, 'the same jemaat twice in one komisi is rejected'
);
select lives_ok(
  format($$ insert into public.komisi_anggota (komisi_id, jemaat_id, jabatan_id) values
       ('%s', '6a000000-0000-4000-8000-0000000000a3', '%s') $$, :'komisi_dua', :'ketua_id'),
  'the same jemaat in a different komisi is accepted'
);

-- ---------------------------------------------------------------------------
-- komisi_anggota RLS: needs situs:update AND warta:read to write, both
-- situs:read AND warta:read to read
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"6a000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;
select ok((select count(*)::int from public.komisi_anggota) > 0, 'viewer (situs:read + warta:read) reads komisi_anggota');
select throws_ok(
  format($$ insert into public.komisi_anggota (komisi_id, jemaat_id, jabatan_id) values ('%s', '6a000000-0000-4000-8000-0000000000a4', '%s') $$, :'komisi_dua', :'anggota_jabatan_id'),
  '42501', null::text, 'viewer cannot insert komisi_anggota'
);
reset role;

-- the custom role (situs:update, no warta:read) cannot write komisi_anggota
set local request.jwt.claims = '{"sub":"6a000000-0000-4000-8000-000000000004","role":"authenticated"}';
set local role authenticated;
select throws_ok(
  format($$ insert into public.komisi_anggota (komisi_id, jemaat_id, jabatan_id) values ('%s', '6a000000-0000-4000-8000-0000000000a4', '%s') $$, :'komisi_dua', :'anggota_jabatan_id'),
  '42501', null::text, 'situs:update without warta:read cannot insert komisi_anggota (RLS)'
);
select throws_ok(
  format($$ select public.add_komisi_anggota('%s', '6a000000-0000-4000-8000-0000000000a4', '%s') $$, :'komisi_dua', :'anggota_jabatan_id'),
  '42501', 'Kamu tidak punya akses untuk tindakan ini.', 'add_komisi_anggota refuses situs:update without warta:read'
);
reset role;

-- ---------------------------------------------------------------------------
-- add_komisi_anggota / update_komisi_anggota_jabatan: friendly messages
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"6a000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;
select throws_ok(
  format($$ select public.add_komisi_anggota('%s', '6a000000-0000-4000-8000-0000000000a3', '%s') $$, :'komisi_satu', :'anggota_jabatan_id'),
  '23505', 'Uji Sidi sudah menjadi anggota komisi ini.', 'add_komisi_anggota reports a friendly duplicate-membership message'
);
select throws_ok(
  format($$ select public.add_komisi_anggota('%s', '6a000000-0000-4000-8000-0000000000a2', '%s') $$, :'komisi_satu', :'ketua_id'),
  '23505', 'Komisi ini sudah punya Ketua: Uji Sidi.', 'add_komisi_anggota reports a friendly tunggal-jabatan conflict'
);
select throws_ok(
  format($$ select public.add_komisi_anggota('6a000000-0000-4000-8000-000000000099', '6a000000-0000-4000-8000-0000000000a2', '%s') $$, :'ketua_id'),
  'P0002', 'Komisi tidak ditemukan.', 'add_komisi_anggota reports an unknown komisi'
);
select lives_ok(
  format($$ select public.update_komisi_anggota_jabatan('%s', '6a000000-0000-4000-8000-0000000000a3', '%s') $$, :'komisi_satu', :'anggota_jabatan_id'),
  'update_komisi_anggota_jabatan moves Ketua to Anggota (no longer tunggal-conflicting)'
);
select lives_ok(
  format($$ select public.add_komisi_anggota('%s', '6a000000-0000-4000-8000-0000000000a2', '%s') $$, :'komisi_satu', :'ketua_id'),
  'a new Ketua can be added once the old one moved to a different jabatan'
);
select throws_ok(
  format($$ select public.update_komisi_anggota_jabatan('%s', '6a000000-0000-4000-8000-0000000000a4', '%s') $$, :'komisi_satu', :'ketua_id'),
  '23505', 'Komisi ini sudah punya Ketua: Uji Penatua Dua.', 'update_komisi_anggota_jabatan reports the same friendly tunggal conflict'
);
reset role;

-- ---------------------------------------------------------------------------
-- jabatan_komisi: delete-in-use rejected; tunggal toggle cascades/conflicts
-- ---------------------------------------------------------------------------
select throws_ok(
  format($$ delete from public.jabatan_komisi where id = '%s' $$, :'ketua_id'),
  '23503', null::text, 'deleting a jabatan still used by a member is rejected'
);
select lives_ok(
  $$ delete from public.jabatan_komisi where id = '6a000000-0000-4000-8000-0000000000f1' $$,
  'deleting an unused jabatan succeeds'
);
select throws_ok(
  format($$ update public.jabatan_komisi set tunggal = true where id = '%s' $$, :'anggota_jabatan_id'),
  '23505', null::text, 'flipping Anggota to tunggal while a komisi already holds it twice is rejected'
);
select is(
  (select tunggal from public.jabatan_komisi where id = :'anggota_jabatan_id'),
  false,
  'the rejected tunggal flip left the jabatan unchanged'
);
select is(
  (select bool_and(not jabatan_tunggal) from public.komisi_anggota where jabatan_id = :'anggota_jabatan_id'),
  true,
  'and left every Anggota row''s denormalized jabatan_tunggal unchanged too'
);

-- ---------------------------------------------------------------------------
-- Deleting a jemaat: removed from membership; pembina becomes empty
-- ---------------------------------------------------------------------------
select lives_ok(
  format($$ insert into public.komisi (nama, slug, pembina_jemaat_id) values
       ('Komisi Uji Hapus', 'komisi-uji-hapus', '6a000000-0000-4000-8000-0000000000a1') $$),
  'setup: a komisi with a pembina for the delete-cascade check'
);
select lives_ok(
  format($$ insert into public.komisi_anggota (komisi_id, jemaat_id, jabatan_id)
       select id, '6a000000-0000-4000-8000-0000000000a8', '%s' from public.komisi where slug = 'komisi-uji-hapus' $$, :'anggota_jabatan_id'),
  'setup: a member for the delete-cascade check'
);
with d as (delete from public.jemaat where id = '6a000000-0000-4000-8000-0000000000a1' returning 1)
select is(count(*)::int, 1, 'the pembina jemaat is deleted') from d;
select is(
  (select pembina_jemaat_id from public.komisi where slug = 'komisi-uji-hapus'),
  null::uuid,
  'that komisi''s pembina_jemaat_id is now null'
);
with d as (delete from public.jemaat where id = '6a000000-0000-4000-8000-0000000000a8' returning 1)
select is(count(*)::int, 1, 'the member jemaat is deleted') from d;
select is(
  (select count(*)::int from public.komisi_anggota where jemaat_id = '6a000000-0000-4000-8000-0000000000a8'),
  0,
  'their komisi_anggota row is gone too (cascade)'
);

-- ---------------------------------------------------------------------------
-- Public functions: name + jabatan only, tampil/eligibility filtered
-- ---------------------------------------------------------------------------
-- (Membership requires an eligible status at write time; to test the public
-- function hiding an ineligible member, add them while eligible, then flip
-- their status, per brief §14.8's own "keep the row, hide at read time" rule.)
select lives_ok(
  format($$ insert into public.komisi_anggota (komisi_id, jemaat_id, jabatan_id)
       select id, '6a000000-0000-4000-8000-0000000000a2', '%s' from public.komisi where slug = 'komisi-uji-foto' $$, :'anggota_jabatan_id'),
  'setup: add an eligible member to the photo-having komisi'
);
update public.jemaat set status_keanggotaan = 'simpatisan' where id = '6a000000-0000-4000-8000-0000000000a2';
update public.komisi set tampil = true where slug = 'komisi-uji-foto';
-- Captured here (as postgres): anon has zero table privileges on komisi
-- (revoke all), so referencing it directly while impersonating anon below
-- would be a hard "permission denied" error, not an empty RLS-filtered set.
select count(*)::int as tampil_count from public.komisi where tampil = true \gset

set local role anon;
select throws_ok($$ select 1 from public.komisi $$, '42501', null::text, 'anon cannot select komisi directly');
select throws_ok($$ select 1 from public.jabatan_komisi $$, '42501', null::text, 'anon cannot select jabatan_komisi directly');
select throws_ok($$ select 1 from public.komisi_anggota $$, '42501', null::text, 'anon cannot select komisi_anggota directly');
select throws_ok($$ select 1 from public.komisi_settings $$, '42501', null::text, 'anon cannot select komisi_settings directly');

select is(
  (select count(*)::int from public.public_komisi_list()),
  :tampil_count,
  'public_komisi_list() returns exactly the tampil = true rows'
);
select is(
  (select array_agg(a.key order by a.key) from jsonb_each(public.public_komisi_detail('komisi-uji-foto')) a),
  array['anggota', 'deskripsi', 'foto_alt', 'foto_path', 'id', 'nama', 'pembina_nama', 'periode', 'slug'],
  'public_komisi_detail() returns exactly the public keys (no jemaat id, no_hp, or alamat)'
);
select is(
  public.public_komisi_detail('komisi-uji-foto') -> 'anggota',
  '[]'::jsonb,
  'the ineligible member (status changed after joining) is excluded from the public response'
);
select is(
  public.public_komisi_detail('tidak-ada-slug-begini'),
  null::jsonb,
  'an unknown slug returns null'
);
reset role;

update public.komisi set tampil = false where slug = 'komisi-uji-foto';

set local role anon;
select is(
  public.public_komisi_detail('komisi-uji-foto'),
  null::jsonb,
  'a tampil = false komisi returns null even for an existing slug'
);
reset role;

-- ---------------------------------------------------------------------------
-- situs_referenced_photo_paths() includes komisi (0032)
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"6a000000-0000-4000-8000-000000000003","role":"authenticated"}';
set local role authenticated;
select ok(
  (select 'komisi/dddddddd-dddd-4ddd-8ddd-dddddddddda1.jpg'::text = any (select public.situs_referenced_photo_paths())),
  'referenced paths include the surviving komisi photo'
);
reset role;

select * from finish();
rollback;
