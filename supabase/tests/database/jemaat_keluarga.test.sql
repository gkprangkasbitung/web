-- save_jemaat and set_jemaat_keluarga (brief §9.9-9.10, §12.6): who may call,
-- family resolution by name, one Kepala Keluarga per family, and atomicity.
begin;
create extension if not exists pgtap with schema extensions;

select plan(30);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres). Rolled back at the end.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('14000000-0000-4000-8000-000000000001', 'jk-editor@test.local'),
  ('14000000-0000-4000-8000-000000000002', 'jk-viewer@test.local');

insert into public.user_roles (user_id, role_id)
select v.user_id::uuid, r.id
from (values
  ('14000000-0000-4000-8000-000000000001', 'editor'),
  ('14000000-0000-4000-8000-000000000002', 'viewer')
) as v (user_id, role_name)
join public.roles r on r.name = v.role_name;

insert into public.wilayah (id, nama) values ('14000000-0000-4000-8000-0000000000f1', 'Uji Wilayah JK');
insert into public.label_jemaat (id, nama) values
  ('14000000-0000-4000-8000-0000000000b1', 'Uji Label JK Satu'),
  ('14000000-0000-4000-8000-0000000000b2', 'Uji Label JK Dua');
insert into public.keluarga (id, nama) values ('14000000-0000-4000-8000-0000000000c1', 'Uji Keluarga JK Ada');
insert into public.jemaat (id, nama, keluarga_id, hubungan_keluarga) values
  ('14000000-0000-4000-8000-0000000000a1', 'Uji Jemaat JK Kepala', '14000000-0000-4000-8000-0000000000c1', 'Kepala Keluarga'),
  ('14000000-0000-4000-8000-0000000000a2', 'Uji Jemaat JK Bebas', null, null);

-- ---------------------------------------------------------------------------
-- Who may call
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"role":"anon"}';
set local role anon;
select throws_ok(
  $$ select public.save_jemaat('Ditolak') $$, '42501', null::text, 'anon cannot call save_jemaat'
);
select throws_ok(
  $$ select public.set_jemaat_keluarga('14000000-0000-4000-8000-0000000000a1', null, null) $$,
  '42501', null::text, 'anon cannot call set_jemaat_keluarga'
);

reset role;
set local request.jwt.claims = '{"sub":"14000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;
select throws_ok(
  $$ select public.save_jemaat('Ditolak') $$,
  '42501', 'Kamu tidak punya akses untuk tindakan ini.', 'viewer cannot call save_jemaat'
);
select throws_ok(
  $$ select public.set_jemaat_keluarga('14000000-0000-4000-8000-0000000000a1', null, null) $$,
  '42501', 'Kamu tidak punya akses untuk tindakan ini.', 'viewer cannot call set_jemaat_keluarga'
);

-- ---------------------------------------------------------------------------
-- editor: save_jemaat, new jemaat, new family by name
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub":"14000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

select throws_ok(
  $$ select public.save_jemaat('   ') $$, '22023', 'Nama wajib diisi.', 'a blank name is rejected'
);

select lives_ok(
  $$ select public.save_jemaat(
       p_nama => 'Uji Jemaat JK Baru', p_nomor_anggota => 'UJI-JK-0001', p_wilayah_id => '14000000-0000-4000-8000-0000000000f1',
       p_keluarga_nama => 'Uji Keluarga JK Baru', p_hubungan_keluarga => 'Kepala Keluarga',
       p_label_ids => array['14000000-0000-4000-8000-0000000000b1', '14000000-0000-4000-8000-0000000000b2']::uuid[]
     ) $$,
  'save_jemaat creates a jemaat, its family, and its labels'
);
select results_eq(
  $$ select j.nama, j.nomor_anggota, j.wilayah_id, k.nama, j.hubungan_keluarga
     from public.jemaat j join public.keluarga k on k.id = j.keluarga_id
     where j.nama = 'Uji Jemaat JK Baru' $$,
  $$ values (
       'Uji Jemaat JK Baru'::text, 'UJI-JK-0001'::text, '14000000-0000-4000-8000-0000000000f1'::uuid,
       'Uji Keluarga JK Baru'::text, 'Kepala Keluarga'::text
     ) $$,
  'the profile and the new family are saved together'
);
select results_eq(
  $$ select l.nama from public.jemaat_labels jl
     join public.label_jemaat l on l.id = jl.label_id
     join public.jemaat j on j.id = jl.jemaat_id
     where j.nama = 'Uji Jemaat JK Baru' order by l.nama $$,
  $$ values ('Uji Label JK Dua'::text), ('Uji Label JK Satu'::text) $$,
  'both labels are attached'
);

-- ---------------------------------------------------------------------------
-- Family name resolution is case-insensitive; reuses, never duplicates
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ select public.save_jemaat(p_nama => 'Uji Jemaat JK Dua', p_keluarga_nama => '  uji keluarga jk baru  ') $$,
  'save_jemaat resolves a family case-insensitively, wildcards and padding included'
);
select is(
  (select count(*) from public.keluarga where lower(nama) = 'uji keluarga jk baru'),
  1::bigint,
  'no duplicate family was created'
);
select is(
  (select k.nama from public.jemaat j join public.keluarga k on k.id = j.keluarga_id where j.nama = 'Uji Jemaat JK Dua'),
  'Uji Keluarga JK Baru'::text,
  'the second jemaat joined the same family'
);

-- ---------------------------------------------------------------------------
-- Editing: blank family name clears the link and the hubungan with it
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ select public.save_jemaat(
       p_id => (select id from public.jemaat where nama = 'Uji Jemaat JK Dua'),
       p_nama => 'Uji Jemaat JK Dua', p_keluarga_nama => null
     ) $$,
  'editing with a blank family name clears the link'
);
select results_eq(
  $$ select keluarga_id, hubungan_keluarga from public.jemaat where nama = 'Uji Jemaat JK Dua' $$,
  $$ values (null::uuid, null::text) $$,
  'keluarga_id and hubungan_keluarga are both null'
);

-- ---------------------------------------------------------------------------
-- Nomor anggota uniqueness
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select public.save_jemaat(p_nama => 'Uji Jemaat JK Tiga', p_nomor_anggota => 'UJI-JK-0001') $$,
  '23505', 'Nomor anggota sudah digunakan.', 'a taken nomor anggota is rejected'
);
select lives_ok(
  $$ select public.save_jemaat(
       p_id => (select id from public.jemaat where nama = 'Uji Jemaat JK Baru'),
       p_nama => 'Uji Jemaat JK Baru', p_nomor_anggota => 'UJI-JK-0001'
     ) $$,
  'keeping your own nomor anggota on an edit is fine'
);

-- ---------------------------------------------------------------------------
-- Kepala Keluarga: at most one per family
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select public.save_jemaat(
       p_nama => 'Uji Jemaat JK Empat', p_keluarga_nama => 'Uji Keluarga JK Ada', p_hubungan_keluarga => 'Kepala Keluarga'
     ) $$,
  '23505', 'Keluarga ini sudah punya Kepala Keluarga.', 'a second Kepala Keluarga in the same family is rejected'
);
select is(
  (select count(*) from public.jemaat where nama = 'Uji Jemaat JK Empat'),
  0::bigint,
  'nothing was written: the whole call rolled back'
);
select lives_ok(
  $$ select public.save_jemaat(
       p_id => '14000000-0000-4000-8000-0000000000a1', p_nama => 'Uji Jemaat JK Kepala',
       p_keluarga_nama => 'Uji Keluarga JK Ada', p_hubungan_keluarga => 'Kepala Keluarga'
     ) $$,
  'keeping your own Kepala Keluarga status on an edit is fine'
);

-- Unknown references
select throws_ok(
  $$ select public.save_jemaat(p_nama => 'x', p_wilayah_id => '14000000-0000-4000-8000-0000000000ff') $$,
  '23503', 'Wilayah tidak ditemukan.', 'save_jemaat rejects an unknown wilayah'
);
select throws_ok(
  $$ select public.save_jemaat(p_id => '14000000-0000-4000-8000-0000000000ff', p_nama => 'x') $$,
  'P0002', 'Jemaat tidak ditemukan.', 'save_jemaat rejects an unknown id to edit'
);

-- ---------------------------------------------------------------------------
-- set_jemaat_keluarga: add, move, inline hubungan change, and Keluarkan
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ select public.set_jemaat_keluarga(
       '14000000-0000-4000-8000-0000000000a2', '14000000-0000-4000-8000-0000000000c1', 'Anak'
     ) $$,
  'set_jemaat_keluarga adds a jemaat to a family'
);
select results_eq(
  $$ select keluarga_id, hubungan_keluarga from public.jemaat where id = '14000000-0000-4000-8000-0000000000a2' $$,
  $$ values ('14000000-0000-4000-8000-0000000000c1'::uuid, 'Anak'::text) $$,
  'the family and hubungan are set together'
);

select lives_ok(
  $$ select public.set_jemaat_keluarga(
       '14000000-0000-4000-8000-0000000000a2', '14000000-0000-4000-8000-0000000000c1', 'Kerabat Lain'
     ) $$,
  'the inline hubungan change reuses the same function'
);
select is(
  (select hubungan_keluarga from public.jemaat where id = '14000000-0000-4000-8000-0000000000a2'),
  'Kerabat Lain'::text,
  'hubungan_keluarga is updated'
);

select throws_ok(
  $$ select public.set_jemaat_keluarga(
       '14000000-0000-4000-8000-0000000000a2', '14000000-0000-4000-8000-0000000000c1', 'Kepala Keluarga'
     ) $$,
  '23505', 'Keluarga ini sudah punya Kepala Keluarga.', 'moving someone in as a second Kepala Keluarga is rejected'
);

select lives_ok(
  $$ select public.set_jemaat_keluarga('14000000-0000-4000-8000-0000000000a2', null, null) $$,
  '"Keluarkan" clears both fields'
);
select results_eq(
  $$ select keluarga_id, hubungan_keluarga from public.jemaat where id = '14000000-0000-4000-8000-0000000000a2' $$,
  $$ values (null::uuid, null::text) $$,
  'the jemaat is detached'
);

select throws_ok(
  $$ select public.set_jemaat_keluarga('14000000-0000-4000-8000-0000000000ff', null, null) $$,
  'P0002', 'Jemaat tidak ditemukan.', 'set_jemaat_keluarga rejects an unknown jemaat'
);
select throws_ok(
  $$ select public.set_jemaat_keluarga(
       '14000000-0000-4000-8000-0000000000a2', '14000000-0000-4000-8000-0000000000ff', null
     ) $$,
  'P0002', 'Keluarga tidak ditemukan.', 'set_jemaat_keluarga rejects an unknown family'
);

-- ---------------------------------------------------------------------------
-- keluarga.nama unique case-insensitively
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.keluarga (nama) values ('uji keluarga jk ada') $$,
  '23505', null::text, 'a family name differing only by case is rejected at the database level'
);

select * from finish();
rollback;
