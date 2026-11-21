-- Portal Jemaat backend (stage 13a; migration 0037): the portal schema,
-- ownership-scoped functions, change requests, and the admin decision RPCs.
--
-- Jemaat A ("Anna") and her son A2 ("Andi") share a family; jemaat B
-- ("Budi") is in another one. B's values carry markers (Budi, 0822…,
-- UJI-PB, 777777, "Tempat Budi") so a leak shows up in any output text.
begin;
create extension if not exists pgtap with schema extensions;

select plan(94);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres). Rolled back at the end.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('37000000-0000-4000-8000-000000000001', 'portal-data-a@test.local'),
  ('37000000-0000-4000-8000-000000000002', 'portal-data-b@test.local'),
  ('37000000-0000-4000-8000-000000000003', 'portal-data-viewer@test.local'),
  ('37000000-0000-4000-8000-000000000004', 'portal-data-admin@test.local');

insert into public.user_roles (user_id, role_id)
select v.user_id::uuid, r.id
from (
  values
    ('37000000-0000-4000-8000-000000000003', 'viewer'),
    ('37000000-0000-4000-8000-000000000004', 'admin')
) as v (user_id, role_name)
join public.roles r on r.name = v.role_name;

insert into public.wilayah (id, nama) values ('37000000-0000-4000-8000-0000000000f1', 'Wilayah Uji Anna');
insert into public.keluarga (id, nama) values
  ('37000000-0000-4000-8000-0000000000e1', 'Keluarga Uji Anna'),
  ('37000000-0000-4000-8000-0000000000e2', 'Keluarga Uji Budi');

insert into public.jemaat (
  id, nama, nomor_anggota, jenis_kelamin, status_keanggotaan, wilayah_id, keluarga_id, hubungan_keluarga,
  tanggal_lahir, tanggal_masuk, pekerjaan, alamat, no_hp
) values
  ('37000000-0000-4000-8000-0000000000a1', 'Uji Portal Anna', 'UJI-PA-001', 'perempuan', 'sidi',
   '37000000-0000-4000-8000-0000000000f1', '37000000-0000-4000-8000-0000000000e1', 'Kepala Keluarga',
   '1980-01-01', '2000-02-02', 'Guru', 'Jalan Anna 1', '081100000001'),
  ('37000000-0000-4000-8000-0000000000a2', 'Uji Portal Andi', 'UJI-PA-002', 'laki_laki', 'baptis_anak',
   null, '37000000-0000-4000-8000-0000000000e1', 'Anak',
   '2010-05-05', null, 'Pelajar Andi', 'Jalan Andi 2', '081100000002'),
  ('37000000-0000-4000-8000-0000000000b1', 'Uji Portal Budi', 'UJI-PB-009', 'laki_laki', 'anggota_penuh',
   null, '37000000-0000-4000-8000-0000000000e2', 'Kepala Keluarga',
   '1970-07-07', null, 'Petani Budi', 'Jalan Budi 9', '082200000009');

update public.profiles set jemaat_id = '37000000-0000-4000-8000-0000000000a1'
where id = '37000000-0000-4000-8000-000000000001';
update public.profiles set jemaat_id = '37000000-0000-4000-8000-0000000000b1'
where id = '37000000-0000-4000-8000-000000000002';

insert into public.jemaat_catatan_pastoral (jemaat_id, jenis, tanggal, isi) values
  ('37000000-0000-4000-8000-0000000000a1', 'JENIS-PASTORAL-A', '2030-01-01', 'CATATAN-PASTORAL-A'),
  ('37000000-0000-4000-8000-0000000000b1', 'JENIS-PASTORAL-B', '2030-01-01', 'CATATAN-PASTORAL-B');

-- Schedule: A is Pelayan Firman + PNJ on a Kebaktian Minggu, Pelayan
-- Liturgi + PF of two SMKA groups on an SMKA row; B serves next to her and
-- alone on another row ("Tempat Budi"); A also serves outside the range.
insert into public.tempat (id, nama) values
  ('37000000-0000-4000-8000-0000000000d1', 'Tempat Uji Anna'),
  ('37000000-0000-4000-8000-0000000000d2', 'Tempat Budi');

insert into public.peribadahan_items (id, category_id, tanggal, jam, tempat_id, pelayan_firman_id, liturgos_id, pemusik_id, pnj_id)
select '37000000-0000-4000-8000-0000000000c1', c.id, '2030-03-03', '08:00', '37000000-0000-4000-8000-0000000000d1',
       '37000000-0000-4000-8000-0000000000a1', '37000000-0000-4000-8000-0000000000b1',
       '37000000-0000-4000-8000-0000000000a2', '37000000-0000-4000-8000-0000000000a1'
from public.peribadahan_categories c where c.key = 'umum';
insert into public.peribadahan_items (id, category_id, tanggal, jam, liturgos_id)
select '37000000-0000-4000-8000-0000000000c2', c.id, '2030-03-03', '10:00', '37000000-0000-4000-8000-0000000000a1'
from public.peribadahan_categories c where c.key = 'smka';
insert into public.peribadahan_items (id, category_id, tanggal, jam, tempat_id, pemusik_id)
select '37000000-0000-4000-8000-0000000000c3', c.id, '2030-03-10', '08:00', '37000000-0000-4000-8000-0000000000d2',
       '37000000-0000-4000-8000-0000000000b1'
from public.peribadahan_categories c where c.key = 'umum';
insert into public.peribadahan_items (id, category_id, tanggal, jam, pemusik_id)
select '37000000-0000-4000-8000-0000000000c4', c.id, '2031-06-01', '08:00', '37000000-0000-4000-8000-0000000000a1'
from public.peribadahan_categories c where c.key = 'umum';

insert into public.peribadahan_smka_kelompok (item_id, kelompok, pf_id) values
  ('37000000-0000-4000-8000-0000000000c2', 'batita', '37000000-0000-4000-8000-0000000000a1'),
  ('37000000-0000-4000-8000-0000000000c2', 'balita', '37000000-0000-4000-8000-0000000000b1'),
  ('37000000-0000-4000-8000-0000000000c2', 'kecil', '37000000-0000-4000-8000-0000000000a1');

-- Komisi: A is pembina of one and Sekretaris of another (where B is Ketua);
-- B alone in a third; A in a hidden one.
insert into public.jemaat_labels (jemaat_id, label_id)
select '37000000-0000-4000-8000-0000000000a1', pembina_label_id from public.komisi_settings where id = 1;

insert into public.komisi (id, nama, slug, periode, pembina_jemaat_id, tampil, sort_order) values
  ('37000000-0000-4000-8000-000000000101', 'Komisi Uji Pembinaan', 'komisi-uji-pembinaan', null, '37000000-0000-4000-8000-0000000000a1', true, 1),
  ('37000000-0000-4000-8000-000000000102', 'Komisi Uji Musik', 'komisi-uji-musik', '2024–2027', null, true, 2),
  ('37000000-0000-4000-8000-000000000103', 'Komisi Uji Budi', 'komisi-uji-budi', null, null, true, 3),
  ('37000000-0000-4000-8000-000000000104', 'Komisi Uji Tersembunyi', 'komisi-uji-tersembunyi', null, null, false, 4);

insert into public.komisi_anggota (komisi_id, jemaat_id, jabatan_id)
select v.komisi_id::uuid, v.jemaat_id::uuid, jb.id
from (
  values
    ('37000000-0000-4000-8000-000000000102', '37000000-0000-4000-8000-0000000000a1', 'Sekretaris'),
    ('37000000-0000-4000-8000-000000000102', '37000000-0000-4000-8000-0000000000b1', 'Ketua'),
    ('37000000-0000-4000-8000-000000000103', '37000000-0000-4000-8000-0000000000b1', 'Anggota'),
    ('37000000-0000-4000-8000-000000000104', '37000000-0000-4000-8000-0000000000a1', 'Anggota')
) as v (komisi_id, jemaat_id, jabatan)
join public.jabatan_komisi jb on jb.nama = v.jabatan;

-- Persembahan Bulanan: A twice in 2030 and once in 2029; A2 (family) and B
-- once each in 2030.
insert into public.sarana_dana_transactions (item_id, tanggal, tipe, jumlah, jemaat_id)
select i.id, v.tanggal::date, 'masuk', v.jumlah, v.jemaat_id::uuid
from (
  values
    ('2030-01-15', 100000, '37000000-0000-4000-8000-0000000000a1'),
    ('2030-02-15', 150000, '37000000-0000-4000-8000-0000000000a1'),
    ('2029-12-15', 90000, '37000000-0000-4000-8000-0000000000a1'),
    ('2030-01-20', 55555, '37000000-0000-4000-8000-0000000000a2'),
    ('2030-01-25', 777777, '37000000-0000-4000-8000-0000000000b1')
) as v (tanggal, jumlah, jemaat_id)
cross join public.sarana_dana_items i
where i.key = 'persembahan_bulanan';

-- B already has a waiting request.
insert into public.jemaat_pengajuan_perubahan (id, jemaat_id, diajukan_oleh, data) values
  ('37000000-0000-4000-8000-000000000201', '37000000-0000-4000-8000-0000000000b1',
   '37000000-0000-4000-8000-000000000002', '{"alamat": "Alamat Baru Budi"}');

-- ---------------------------------------------------------------------------
-- Catalog: every portal function, including ones added later
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from pg_proc where pronamespace = 'portal'::regnamespace and not prosecdef),
  0, 'every function in schema portal is security definer'
);
select is(
  (select count(*)::int from pg_proc
   where pronamespace = 'portal'::regnamespace and proconfig is distinct from array['search_path=""']),
  0, 'every function in schema portal has an empty search_path'
);
select is(has_schema_privilege('anon', 'portal', 'usage'), false, 'anon has no usage on schema portal');
select is(has_schema_privilege('authenticated', 'portal', 'usage'), true, 'authenticated has usage on schema portal');
select is(
  (select count(*)::int from pg_proc
   where pronamespace = 'portal'::regnamespace and has_function_privilege('anon', oid, 'execute')),
  0, 'anon can execute no portal function'
);
select is(
  (select count(*)::int from pg_proc p
   where p.pronamespace = 'portal'::regnamespace
     and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0))),
  0, 'no portal function is executable by PUBLIC (explicit ACL, no PUBLIC grant)'
);
select is(
  has_function_privilege('authenticated', 'portal._jemaat_id_saya()', 'execute'),
  false, 'authenticated cannot call the internal _jemaat_id_saya() directly'
);
select is(
  (select array_agg(proname::text order by proname) from pg_proc
   where pronamespace = 'portal'::regnamespace and has_function_privilege('authenticated', oid, 'execute')),
  array['ajukan_perubahan', 'batalkan_pengajuan', 'keluarga_saya', 'komisi_saya', 'pelayanan_saya',
        'pengajuan_saya', 'pengaturan_portal', 'persembahan_saya', 'profil_saya'],
  'authenticated can execute exactly the nine portal functions'
);
select is(
  (select count(*)::int
   from pg_proc p,
     unnest(p.proargnames, coalesce(p.proargmodes::text[], array_fill('i'::text, array[coalesce(cardinality(p.proargnames), 0)]))) as a (name, mode)
   where p.pronamespace = 'portal'::regnamespace and a.mode in ('i', 'b', 'v') and a.name ~* '(jemaat|keluarga|user|uid)'),
  0, 'no portal function takes a jemaat, keluarga, or user id'
);
select is(
  (select count(*)::int from pg_proc where pronamespace = 'portal'::regnamespace and prosrc ~* 'catatan_pastoral'),
  0, 'no portal function reads jemaat_catatan_pastoral'
);
select is(
  (select count(*)::int
   from pg_proc p, unnest(p.proargnames, p.proargmodes::text[]) as a (name, mode)
   where p.pronamespace = 'portal'::regnamespace and a.mode = 't'
     and (a.name in ('isi', 'jenis', 'penulis_id', 'penulis_nama') or a.name ~* 'pastoral')),
  0, 'no portal function returns a pastoral-note column'
);
select is(
  (select array_agg(a.name order by a.ord)
   from pg_proc p, unnest(p.proargnames, p.proargmodes::text[]) with ordinality as a (name, mode, ord)
   where p.oid = 'portal.keluarga_saya()'::regprocedure and a.mode = 't'),
  array['nama', 'hubungan_keluarga', 'status_keanggotaan']::text[],
  'keluarga_saya returns exactly nama, hubungan_keluarga, status_keanggotaan'
);

-- ---------------------------------------------------------------------------
-- Setting and table
-- ---------------------------------------------------------------------------
select is(
  (select portal_tampilkan_persembahan from public.profil_gereja where id = 1),
  false, 'portal_tampilkan_persembahan defaults to false'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.jemaat_pengajuan_perubahan'::regclass),
  true, 'RLS is enabled on jemaat_pengajuan_perubahan'
);
select is(
  (select array_agg(cmd::text) from pg_policies where schemaname = 'public' and tablename = 'jemaat_pengajuan_perubahan'),
  array['SELECT'], 'jemaat_pengajuan_perubahan has a select policy only, no write policy'
);
select throws_ok(
  $$ insert into public.jemaat_pengajuan_perubahan (jemaat_id, data)
     values ('37000000-0000-4000-8000-0000000000a2', '{"nomor_anggota": "X"}') $$,
  '23514', null::text, 'the table itself refuses a key outside the whitelist'
);
select throws_ok(
  $$ insert into public.jemaat_pengajuan_perubahan (jemaat_id, data)
     values ('37000000-0000-4000-8000-0000000000b1', '{"pekerjaan": "Lain"}') $$,
  '23505', null::text, 'the partial unique index allows one waiting request per jemaat'
);
select throws_ok(
  $$ update public.jemaat_pengajuan_perubahan set status = 'ditolak', ditinjau_pada = now()
     where id = '37000000-0000-4000-8000-000000000201' $$,
  '23514', null::text, 'a rejection without catatan_admin is refused'
);

-- ---------------------------------------------------------------------------
-- anon
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$ select * from portal.profil_saya() $$, '42501', null::text, 'anon cannot call portal.profil_saya');
select throws_ok(
  $$ select portal.ajukan_perubahan('{"alamat":"x"}') $$, '42501', null::text, 'anon cannot call portal.ajukan_perubahan'
);
select throws_ok($$ select public.setujui_pengajuan(gen_random_uuid()) $$, '42501', null::text, 'anon cannot call setujui_pengajuan');
reset role;

-- ---------------------------------------------------------------------------
-- A staff account without a jemaat link: a clear PT403 from every function
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"37000000-0000-4000-8000-000000000003","role":"authenticated"}';
set local role authenticated;
select throws_ok($$ select * from portal.profil_saya() $$, 'PT403', 'Akun ini belum terhubung ke data jemaat.', 'staff without jemaat: profil_saya');
select throws_ok($$ select * from portal.keluarga_saya() $$, 'PT403', 'Akun ini belum terhubung ke data jemaat.', 'staff without jemaat: keluarga_saya');
select throws_ok($$ select * from portal.pelayanan_saya('2030-01-01', '2030-12-31') $$, 'PT403', 'Akun ini belum terhubung ke data jemaat.', 'staff without jemaat: pelayanan_saya');
select throws_ok($$ select * from portal.komisi_saya() $$, 'PT403', 'Akun ini belum terhubung ke data jemaat.', 'staff without jemaat: komisi_saya');
select throws_ok($$ select * from portal.persembahan_saya(2030) $$, 'PT403', 'Akun ini belum terhubung ke data jemaat.', 'staff without jemaat: persembahan_saya');
select throws_ok($$ select * from portal.pengaturan_portal() $$, 'PT403', 'Akun ini belum terhubung ke data jemaat.', 'staff without jemaat: pengaturan_portal');
select throws_ok($$ select * from portal.pengajuan_saya() $$, 'PT403', 'Akun ini belum terhubung ke data jemaat.', 'staff without jemaat: pengajuan_saya');
select throws_ok($$ select portal.ajukan_perubahan('{"alamat":"x"}') $$, 'PT403', 'Akun ini belum terhubung ke data jemaat.', 'staff without jemaat: ajukan_perubahan');
select throws_ok($$ select portal.batalkan_pengajuan('37000000-0000-4000-8000-000000000201') $$, 'PT403', 'Akun ini belum terhubung ke data jemaat.', 'staff without jemaat: batalkan_pengajuan');
reset role;

-- ---------------------------------------------------------------------------
-- Jemaat A: own data only
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"37000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

select results_eq(
  $$ select * from portal.profil_saya() $$,
  $$ values ('Uji Portal Anna'::text, 'UJI-PA-001'::text, 'perempuan'::text, 'sidi'::text, 'Wilayah Uji Anna'::text,
             'Keluarga Uji Anna'::text, 'Kepala Keluarga'::text, '1980-01-01'::date, '2000-02-02'::date,
             'Guru'::text, 'Jalan Anna 1'::text, '081100000001'::text) $$,
  'profil_saya returns the caller''s own record'
);
select results_eq(
  $$ select * from portal.keluarga_saya() $$,
  $$ values ('Uji Portal Anna'::text, 'Kepala Keluarga'::text, 'sidi'::text),
            ('Uji Portal Andi'::text, 'Anak'::text, 'baptis_anak'::text) $$,
  'keluarga_saya lists the caller''s family, Kepala Keluarga first'
);
select is(
  (select string_agg(x::text, ' ') from portal.keluarga_saya() x) ~ '(0811|Jalan Andi|2010-05-05|Pelajar Andi|UJI-PA-002)',
  false, 'keluarga_saya carries no no_hp, alamat, tanggal_lahir, pekerjaan, or nomor_anggota of family members'
);
select results_eq(
  $$ select * from portal.pelayanan_saya('2030-01-01', '2030-12-31') $$,
  $$ values
       ('2030-03-03'::date, '08:00'::time, 'umum'::text, 'Kebaktian Minggu'::text, 'Tempat Uji Anna'::text, 'pelayan_firman'::text, null::text),
       ('2030-03-03'::date, '08:00'::time, 'umum'::text, 'Kebaktian Minggu'::text, 'Tempat Uji Anna'::text, 'pnj'::text, null::text),
       ('2030-03-03'::date, '10:00'::time, 'smka'::text, 'Kebaktian SMKA'::text, null::text, 'liturgos'::text, null::text),
       ('2030-03-03'::date, '10:00'::time, 'smka'::text, 'Kebaktian SMKA'::text, null::text, 'smka_pf'::text, 'batita'::text),
       ('2030-03-03'::date, '10:00'::time, 'smka'::text, 'Kebaktian SMKA'::text, null::text, 'smka_pf'::text, 'kecil'::text) $$,
  'pelayanan_saya: every role the caller fills in range (incl. PNJ and SMKA PF), none of B''s, nothing out of range'
);
select throws_ok(
  $$ select * from portal.pelayanan_saya('2030-02-01', '2030-01-01') $$,
  '22023', 'Tanggal awal tidak boleh setelah tanggal akhir.', 'pelayanan_saya refuses dari > sampai'
);
select throws_ok(
  $$ select * from portal.pelayanan_saya(null, '2030-01-01') $$,
  '22023', 'Rentang tanggal wajib diisi.', 'pelayanan_saya refuses a missing date'
);
select lives_ok(
  $$ select * from portal.pelayanan_saya('2030-01-01', '2031-02-04') $$,
  'pelayanan_saya accepts exactly 400 days (both ends included)'
);
select throws_ok(
  $$ select * from portal.pelayanan_saya('2030-01-01', '2031-02-05') $$,
  '22023', 'Rentang tanggal paling lama 400 hari.', 'pelayanan_saya refuses 401 days'
);
select results_eq(
  $$ select * from portal.komisi_saya() $$,
  $$ values ('Komisi Uji Pembinaan'::text, 'komisi-uji-pembinaan'::text, null::text, 'Pembina'::text),
            ('Komisi Uji Musik'::text, 'komisi-uji-musik'::text, '2024–2027'::text, 'Sekretaris'::text) $$,
  'komisi_saya: pembina + own membership, not B''s komisi, not a hidden komisi'
);
select is_empty($$ select * from portal.persembahan_saya(2030) $$, 'persembahan_saya is empty while the setting is off');
select results_eq(
  $$ select * from portal.pengaturan_portal() $$, $$ values (false) $$, 'pengaturan_portal reports the setting off'
);
select is_empty($$ select * from portal.pengajuan_saya() $$, 'pengajuan_saya: A has none (B''s is not shown)');

-- Direct reads: nothing, own rows included.
select is((select count(*)::int from public.jemaat), 0, 'A reads no jemaat rows directly');
select is((select count(*)::int from public.keluarga), 0, 'A reads no keluarga rows directly');
select is((select count(*)::int from public.sarana_dana_transactions), 0, 'A reads no transactions directly');
select is((select count(*)::int from public.jemaat_catatan_pastoral), 0, 'A reads no pastoral notes directly');
select is((select count(*)::int from public.jemaat_pengajuan_perubahan), 0, 'A reads no change requests directly');
select throws_ok(
  $$ insert into public.jemaat_pengajuan_perubahan (jemaat_id, data)
     values ('37000000-0000-4000-8000-0000000000a1', '{"alamat": "Langsung"}') $$,
  '42501', null::text, 'A cannot insert a change request directly'
);
select throws_ok(
  $$ update public.jemaat_pengajuan_perubahan set status = 'dibatalkan' $$,
  '42501', null::text, 'A cannot update change requests directly'
);

-- ---------------------------------------------------------------------------
-- ajukan_perubahan / batalkan_pengajuan as A
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select portal.ajukan_perubahan('{"status_keanggotaan": "anggota_penuh"}') $$,
  '22023', 'Data "status_keanggotaan" tidak bisa diajukan lewat Portal Jemaat. Yang bisa diajukan hanya No. HP, Alamat, dan Pekerjaan.',
  'a key outside the whitelist (status_keanggotaan) is refused'
);
select throws_ok(
  $$ select portal.ajukan_perubahan('{"alamat": "Jalan Baru", "nomor_anggota": "UJI-X"}') $$,
  '22023', null::text, 'nomor_anggota is refused, even next to an allowed key'
);
select throws_ok(
  $$ select portal.ajukan_perubahan('{"no_hp": "0811-2233-44"}') $$,
  '22023', 'No. HP hanya boleh berisi angka, 8 sampai 15 digit.', 'a no_hp with non-digits is refused'
);
select throws_ok(
  $$ select portal.ajukan_perubahan('{"no_hp": "0811"}') $$,
  '22023', 'No. HP hanya boleh berisi angka, 8 sampai 15 digit.', 'a too-short no_hp is refused'
);
select throws_ok(
  $$ select portal.ajukan_perubahan(jsonb_build_object('alamat', repeat('a', 501))) $$,
  '22023', 'Alamat maksimal 500 karakter.', 'an alamat over 500 characters is refused'
);
select throws_ok(
  $$ select portal.ajukan_perubahan(jsonb_build_object('pekerjaan', repeat('a', 201))) $$,
  '22023', 'Pekerjaan maksimal 200 karakter.', 'a pekerjaan over 200 characters is refused'
);
select throws_ok(
  $$ select portal.ajukan_perubahan('{"no_hp": 81100000001}') $$,
  '22023', 'Data yang dikirim tidak valid.', 'a non-string value is refused'
);
select throws_ok(
  $$ select portal.ajukan_perubahan('["alamat"]') $$,
  '22023', 'Data yang dikirim tidak valid.', 'a non-object is refused'
);
select throws_ok(
  $$ select portal.ajukan_perubahan('{}') $$,
  '22023', 'Pilih minimal satu data yang ingin diubah.', 'an empty object is refused'
);
select throws_ok(
  $$ select portal.ajukan_perubahan('{"no_hp": "081100000001", "alamat": " Jalan Anna 1 "}') $$,
  '22023', 'Tidak ada perubahan dari data saat ini.', 'a request equal to the current data is refused'
);
select lives_ok(
  $$ select portal.ajukan_perubahan('{"no_hp": " 081199998888 ", "alamat": "Jalan Anna 1", "pekerjaan": ""}') $$,
  'a valid request is accepted'
);
select results_eq(
  $$ select data, status, catatan_admin, ditinjau_pada from portal.pengajuan_saya() $$,
  $$ values ('{"no_hp": "081199998888", "pekerjaan": null}'::jsonb, 'menunggu'::text, null::text, null::timestamptz) $$,
  'only the changed fields are stored, trimmed, and an empty string clears the field'
);
select throws_ok(
  $$ select portal.ajukan_perubahan('{"alamat": "Jalan Lain"}') $$,
  '23505', 'Masih ada pengajuan perubahan yang menunggu ditinjau. Batalkan dulu atau tunggu sampai ditinjau.',
  'a second request while one is waiting is refused'
);
select throws_ok(
  $$ select portal.batalkan_pengajuan('37000000-0000-4000-8000-000000000201') $$,
  'P0002', 'Pengajuan tidak ditemukan.', 'A cannot cancel B''s request (answered like a missing one)'
);
select lives_ok(
  $$ select portal.batalkan_pengajuan((select id from portal.pengajuan_saya() where status = 'menunggu')) $$,
  'A cancels her own waiting request'
);
select is(
  (select array_agg(status) from portal.pengajuan_saya()), array['dibatalkan'], 'the request is now dibatalkan'
);
select throws_ok(
  $$ select portal.batalkan_pengajuan((select id from portal.pengajuan_saya() where status = 'dibatalkan')) $$,
  '22023', 'Pengajuan ini sudah tidak menunggu, jadi tidak bisa dibatalkan.', 'a closed request cannot be cancelled'
);
select lives_ok(
  $$ select portal.ajukan_perubahan('{"no_hp": "081199998888", "pekerjaan": ""}') $$,
  'after cancelling, a new request is accepted'
);

-- Turn the persembahan setting on (as postgres), then back to A.
reset role;
update public.profil_gereja set portal_tampilkan_persembahan = true where id = 1;
set local request.jwt.claims = '{"sub":"37000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

select results_eq(
  $$ select * from portal.persembahan_saya(2030) $$,
  $$ values ('2030-01-15'::date, 100000::numeric), ('2030-02-15'::date, 150000::numeric) $$,
  'persembahan_saya with the setting on: only A''s own rows of that year, not A2''s or B''s'
);
select throws_ok(
  $$ select * from portal.persembahan_saya(null) $$, '22023', 'Tahun tidak valid.', 'persembahan_saya refuses a missing year'
);
select results_eq(
  $$ select * from portal.pengaturan_portal() $$, $$ values (true) $$, 'pengaturan_portal reports the setting on'
);

-- Everything A can get from the portal, as one text: none of B's values, no
-- family member's giving, and nothing from a pastoral note.
select is(
  (select string_agg(s.t, ' ') from (
    select x::text as t from portal.profil_saya() x
    union all select x::text from portal.keluarga_saya() x
    union all select x::text from portal.pelayanan_saya('2030-01-01', '2030-12-31') x
    union all select x::text from portal.komisi_saya() x
    union all select x::text from portal.persembahan_saya(2030) x
    union all select x::text from portal.persembahan_saya(2029) x
    union all select x::text from portal.pengaturan_portal() x
    union all select x::text from portal.pengajuan_saya() x
  ) as s) ~* '(Budi|0822|UJI-PB|777777|55555|Ketua|37000000-0000-4000-8000-000000000201)',
  false, 'no portal function returns any of B''s data to A'
);
select is(
  (select string_agg(s.t, ' ') from (
    select x::text as t from portal.profil_saya() x
    union all select x::text from portal.keluarga_saya() x
    union all select x::text from portal.pelayanan_saya('2030-01-01', '2030-12-31') x
    union all select x::text from portal.komisi_saya() x
    union all select x::text from portal.persembahan_saya(2030) x
    union all select x::text from portal.pengajuan_saya() x
  ) as s) ~* 'PASTORAL',
  false, 'no portal function returns pastoral note content'
);

-- ---------------------------------------------------------------------------
-- setujui_pengajuan / tolak_pengajuan
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select public.setujui_pengajuan((select id from portal.pengajuan_saya() where status = 'menunggu')) $$,
  '42501', 'Kamu tidak punya akses untuk tindakan ini.', 'a jemaat cannot approve, not even her own request'
);
select throws_ok(
  $$ select public.tolak_pengajuan('37000000-0000-4000-8000-000000000201', 'Tidak') $$,
  '42501', 'Kamu tidak punya akses untuk tindakan ini.', 'a jemaat cannot reject'
);
reset role;

set local request.jwt.claims = '{"sub":"37000000-0000-4000-8000-000000000003","role":"authenticated"}';
set local role authenticated;
select throws_ok(
  $$ select public.setujui_pengajuan('37000000-0000-4000-8000-000000000201') $$,
  '42501', 'Kamu tidak punya akses untuk tindakan ini.', 'a viewer (warta:read only) cannot approve'
);
select throws_ok(
  $$ select public.tolak_pengajuan('37000000-0000-4000-8000-000000000201', 'Tidak') $$,
  '42501', 'Kamu tidak punya akses untuk tindakan ini.', 'a viewer cannot reject'
);
select is(
  (select count(*)::int from public.jemaat_pengajuan_perubahan where jemaat_id = '37000000-0000-4000-8000-0000000000b1'),
  1, 'a viewer can read change requests (warta:read)'
);
reset role;

select is(
  (select status from public.jemaat_pengajuan_perubahan where id = '37000000-0000-4000-8000-000000000201'),
  'menunggu', 'the refused attempts changed nothing'
);

set local request.jwt.claims = '{"sub":"37000000-0000-4000-8000-000000000004","role":"authenticated"}';
set local role authenticated;
select is(
  public.setujui_pengajuan(
    (select id from public.jemaat_pengajuan_perubahan
     where jemaat_id = '37000000-0000-4000-8000-0000000000a1' and status = 'menunggu')
  ),
  'Uji Portal Anna', 'an admin approves A''s request; it returns the jemaat''s name'
);
reset role;

select results_eq(
  $$ select no_hp, alamat, pekerjaan from public.jemaat where id = '37000000-0000-4000-8000-0000000000a1' $$,
  $$ values ('081199998888'::text, 'Jalan Anna 1'::text, null::text) $$,
  'approval applied the requested fields to jemaat and left the others alone'
);
select results_eq(
  $$ select status, ditinjau_oleh, ditinjau_pada is not null
     from public.jemaat_pengajuan_perubahan
     where jemaat_id = '37000000-0000-4000-8000-0000000000a1' and status <> 'dibatalkan' $$,
  $$ values ('disetujui'::text, '37000000-0000-4000-8000-000000000004'::uuid, true) $$,
  'the request is closed as disetujui with ditinjau_oleh = the admin'
);

set local request.jwt.claims = '{"sub":"37000000-0000-4000-8000-000000000004","role":"authenticated"}';
set local role authenticated;
select throws_ok(
  $$ select public.setujui_pengajuan(
       (select id from public.jemaat_pengajuan_perubahan
        where jemaat_id = '37000000-0000-4000-8000-0000000000a1' and status = 'disetujui')) $$,
  '22023', 'Pengajuan ini sudah tidak menunggu.', 'an approved request cannot be approved again'
);
select throws_ok(
  $$ select public.tolak_pengajuan(
       (select id from public.jemaat_pengajuan_perubahan
        where jemaat_id = '37000000-0000-4000-8000-0000000000a1' and status = 'disetujui'), 'Telat') $$,
  '22023', 'Pengajuan ini sudah tidak menunggu.', 'an approved request cannot be rejected'
);
select throws_ok(
  $$ select public.setujui_pengajuan(gen_random_uuid()) $$,
  'P0002', 'Pengajuan tidak ditemukan.', 'approving an unknown request → P0002'
);
select throws_ok(
  $$ select public.tolak_pengajuan('37000000-0000-4000-8000-000000000201', '   ') $$,
  '22023', 'Catatan penolakan wajib diisi.', 'a rejection needs a catatan'
);
select throws_ok(
  $$ select public.tolak_pengajuan('37000000-0000-4000-8000-000000000201', repeat('a', 501)) $$,
  '22023', 'Catatan penolakan maksimal 500 karakter.', 'a catatan over 500 characters is refused'
);
select is(
  public.tolak_pengajuan('37000000-0000-4000-8000-000000000201', '  Alamat belum lengkap.  '),
  'Uji Portal Budi', 'an admin rejects B''s request with a catatan'
);
reset role;

select results_eq(
  $$ select status, catatan_admin, ditinjau_oleh from public.jemaat_pengajuan_perubahan
     where id = '37000000-0000-4000-8000-000000000201' $$,
  $$ values ('ditolak'::text, 'Alamat belum lengkap.'::text, '37000000-0000-4000-8000-000000000004'::uuid) $$,
  'the rejection is stored with the trimmed catatan'
);
select is(
  (select alamat from public.jemaat where id = '37000000-0000-4000-8000-0000000000b1'),
  'Jalan Budi 9', 'a rejection leaves the jemaat unchanged'
);

-- Atomic: when applying the change to jemaat fails, the request stays waiting.
insert into public.jemaat_pengajuan_perubahan (id, jemaat_id, diajukan_oleh, data) values
  ('37000000-0000-4000-8000-000000000202', '37000000-0000-4000-8000-0000000000a1',
   '37000000-0000-4000-8000-000000000001', '{"alamat": "Jalan Atomik"}');
create function public.uji_gagal_update_jemaat() returns trigger language plpgsql as $$
begin
  raise exception using errcode = 'P0001', message = 'uji: update jemaat gagal';
end;
$$;
create trigger uji_gagal_update_jemaat before update on public.jemaat
  for each row execute function public.uji_gagal_update_jemaat();

set local request.jwt.claims = '{"sub":"37000000-0000-4000-8000-000000000004","role":"authenticated"}';
set local role authenticated;
select throws_ok(
  $$ select public.setujui_pengajuan('37000000-0000-4000-8000-000000000202') $$,
  'P0001', 'uji: update jemaat gagal', 'approval fails when the jemaat update fails'
);
reset role;
select results_eq(
  $$ select status, ditinjau_oleh, ditinjau_pada from public.jemaat_pengajuan_perubahan
     where id = '37000000-0000-4000-8000-000000000202' $$,
  $$ values ('menunggu'::text, null::uuid, null::timestamptz) $$,
  'atomic: the request is still waiting, not closed'
);
select is(
  (select alamat from public.jemaat where id = '37000000-0000-4000-8000-0000000000a1'),
  'Jalan Anna 1', 'atomic: the jemaat is unchanged'
);
drop trigger uji_gagal_update_jemaat on public.jemaat;
drop function public.uji_gagal_update_jemaat();

-- Deleting A's login (§17.4): the jemaat and her waiting request stay.
delete from auth.users where id = '37000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select status, diajukan_oleh from public.jemaat_pengajuan_perubahan
     where id = '37000000-0000-4000-8000-000000000202' $$,
  $$ values ('menunggu'::text, null::uuid) $$,
  'after the login is deleted, the waiting request stays waiting with diajukan_oleh null'
);
select is(
  (select count(*)::int from public.jemaat where id = '37000000-0000-4000-8000-0000000000a1'),
  1, 'after the login is deleted, the jemaat record stays'
);

select * from finish();
rollback;
