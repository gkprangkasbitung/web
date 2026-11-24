-- Pemilihan, the panitia's side (stage 14b; migration 0040): the peserta
-- import and its resolution, the opening rule, and the panitia's reads.
--
-- People: P = panitia_pemilihan (own jemaat JP, a voter), S = super_admin,
-- V = viewer (no pemilihan permission), R = a role with only pemilihan:read,
-- B = a role with only pemilihan_bantu:create, A = a jemaat-only account
-- (jemaat JA). Elections: X (draft, imported here), Y (draft, never
-- imported).
begin;
create extension if not exists pgtap with schema extensions;

select plan(85);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres). Rolled back at the end.
-- ---------------------------------------------------------------------------

create function pg_temp.sebagai(p_user uuid) returns void language plpgsql as $$
begin
  if p_user is null then
    perform set_config('request.jwt.claims', '', true);
    perform set_config('role', 'postgres', true);
  else
    perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
  end if;
end;
$$;
-- Candidate K<i>'s jemaat id.
create function pg_temp.k(i int) returns uuid language sql immutable as $$
  select ('40000000-0000-4000-8000-0000000001' || lpad(i::text, 2, '0'))::uuid;
$$;
-- One import row as the app sends it.
create function pg_temp.baris(
  p_nama text, p_jemaat uuid, p_kategori text, p_memilih text, p_dipilih text, p_tidak text,
  p_calon uuid[] default null, p_usia text default null, p_ket text default null, p_kelompok text default 'Wil. 1'
) returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'sumber', 'uji.xlsx › ' || p_kelompok, 'kelompok_wilayah', p_kelompok, 'baris', 8, 'nomor', '1',
    'nama', p_nama, 'domisili', null, 'tanda_memilih', p_memilih, 'tanda_dipilih', p_dipilih,
    'tanda_tidak_dipilih', p_tidak, 'usia', p_usia, 'keterangan', p_ket, 'kategori', p_kategori,
    'calon_jemaat_ids', coalesce(to_jsonb(p_calon), case when p_jemaat is null then '[]'::jsonb else jsonb_build_array(p_jemaat) end),
    'catatan', '[]'::jsonb, 'jemaat_id', p_jemaat
  );
$$;
-- The import's row id for a name in X.
create function pg_temp.b(p_nama text) returns uuid language sql stable as $$
  select id from public.pemilihan_impor_baris
  where pemilihan_id = '40000000-0000-4000-8000-000000000e01' and nama = p_nama;
$$;
grant execute on function pg_temp.sebagai(uuid), pg_temp.k(int), pg_temp.baris(text, uuid, text, text, text, text, uuid[], text, text, text), pg_temp.b(text)
  to authenticated, service_role;

insert into auth.users (id, email, raw_user_meta_data) values
  ('40000000-0000-4000-8000-000000000001', 'panitia14b@test.local', '{"full_name": "Panitia Empat Belas"}'),
  ('40000000-0000-4000-8000-000000000002', 'super14b@test.local', '{"full_name": "Super Empat Belas"}'),
  ('40000000-0000-4000-8000-000000000003', 'viewer14b@test.local', '{}'),
  ('40000000-0000-4000-8000-000000000004', 'pembaca14b@test.local', '{}'),
  ('40000000-0000-4000-8000-000000000005', 'bantu14b@test.local', '{}'),
  ('40000000-0000-4000-8000-000000000006', 'jemaat14b@test.local', '{}');

insert into public.roles (id, name, description) values
  ('40000000-0000-4000-8000-0000000000a8', 'uji_pembaca_pemilihan', 'uji'),
  ('40000000-0000-4000-8000-0000000000a9', 'uji_bantu_pemilihan', 'uji');
insert into public.role_permissions (role_id, permission_id)
select '40000000-0000-4000-8000-0000000000a8'::uuid, id from public.permissions where resource = 'pemilihan' and action = 'read'
union all
select '40000000-0000-4000-8000-0000000000a9'::uuid, id from public.permissions where resource = 'pemilihan_bantu' and action = 'create';

insert into public.user_roles (user_id, role_id)
select v.user_id::uuid, r.id
from (
  values
    ('40000000-0000-4000-8000-000000000001', 'panitia_pemilihan'),
    ('40000000-0000-4000-8000-000000000002', 'super_admin'),
    ('40000000-0000-4000-8000-000000000003', 'viewer'),
    ('40000000-0000-4000-8000-000000000004', 'uji_pembaca_pemilihan'),
    ('40000000-0000-4000-8000-000000000005', 'uji_bantu_pemilihan')
) as v (user_id, role_name)
join public.roles r on r.name = v.role_name;

insert into public.wilayah (id, nama) values ('40000000-0000-4000-8000-0000000000d9', 'Wilayah Uji Mandala');
insert into public.jemaat (id, nama, alamat, wilayah_id) values
  ('40000000-0000-4000-8000-0000000000a0', 'Uji Empat Anna', null, null),
  ('40000000-0000-4000-8000-0000000000b0', 'Uji Empat Bima', null, null),
  ('40000000-0000-4000-8000-0000000000f0', 'Uji Empat Panitia', null, null),
  ('40000000-0000-4000-8000-0000000000c1', 'Uji Sama Nama', 'Jl. Mandala 1', '40000000-0000-4000-8000-0000000000d9'),
  ('40000000-0000-4000-8000-0000000000c2', 'Uji Sama Nama', 'Jl. Bypass 2', null),
  ('40000000-0000-4000-8000-0000000000e0', 'Uji Empat Error', null, null),
  ('40000000-0000-4000-8000-0000000000e9', 'Uji Empat Konfirmasi', null, null),
  ('40000000-0000-4000-8000-0000000000d0', 'Uji Empat Pengganti', null, null);
insert into public.jemaat (id, nama) select pg_temp.k(i), 'Uji Kandidat ' || lpad(i::text, 2, '0') from generate_series(1, 10) as i;

update public.profiles p set jemaat_id = v.jemaat_id::uuid
from (
  values
    ('40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-0000000000f0'),
    ('40000000-0000-4000-8000-000000000006', '40000000-0000-4000-8000-0000000000a0')
) as v (user_id, jemaat_id)
where p.id = v.user_id::uuid;
update public.profiles set username = 'uji.anna' where id = '40000000-0000-4000-8000-000000000006';

insert into public.pemilihan (id, nama, dibuka_pada, ditutup_pada) values
  ('40000000-0000-4000-8000-000000000e01', 'Pemilihan Uji Impor', now(), now() + interval '1 hour'),
  ('40000000-0000-4000-8000-000000000e02', 'Pemilihan Uji Kosong', null, null);

-- ---------------------------------------------------------------------------
-- Catalog and privileges
-- ---------------------------------------------------------------------------
select ok(
  (select relrowsecurity from pg_class where oid = 'public.pemilihan_impor_baris'::regclass),
  'RLS is on for pemilihan_impor_baris'
);
select is(
  (select array_agg(p order by p) from unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) as p
   where has_table_privilege('authenticated', 'public.pemilihan_impor_baris', p)),
  null, 'authenticated can''t write import rows directly (only through the functions)'
);
select ok(has_table_privilege('authenticated', 'public.pemilihan_impor_baris', 'SELECT'), 'authenticated may select (RLS: pemilihan:read)');
select is(
  (select count(*)::int from pg_proc
   where oid in (
     'public.impor_peserta_pemilihan(uuid, jsonb)'::regprocedure,
     'public.perbarui_baris_impor(uuid, uuid, boolean, boolean, boolean)'::regprocedure,
     'public.pemilihan_ringkasan()'::regprocedure, 'public.pemilihan_pencatat(uuid)'::regprocedure,
     'public.pemilihan_daftar_jemaat()'::regprocedure, 'public.pemilihan_peserta_akun(uuid)'::regprocedure,
     'public.pemilihan_jemaat_akun(uuid[])'::regprocedure, 'public.pemilihan_kandidat_admin(uuid)'::regprocedure,
     'public.pemilihan_untuk_bantu(uuid)'::regprocedure, 'public.pemilihan_belum_memilih(uuid)'::regprocedure,
     'private.pemilihan_impor_ke_peserta(public.pemilihan_impor_baris)'::regprocedure, 'private.pemilihan_nama_akun(uuid)'::regprocedure,
     'private.pemilihan_guard()'::regprocedure
   ) and prosecdef and proconfig = array['search_path=""']),
  13, 'every 0040 function is security definer with an empty search_path'
);
select is(
  (select count(*)::int from pg_proc p
   where p.oid in ('private.pemilihan_impor_ke_peserta(public.pemilihan_impor_baris)'::regprocedure, 'private.pemilihan_nama_akun(uuid)'::regprocedure)
     and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))),
  0, 'the private helpers aren''t executable by API roles'
);
select ok(
  exists (select 1 from pg_trigger where tgrelid = 'public.pemilihan_impor_baris'::regclass and tgname = 'pemilihan_impor_baris_guard'),
  'import rows have the draft-only guard'
);

-- ---------------------------------------------------------------------------
-- Import
-- ---------------------------------------------------------------------------
create temporary table impor_x as
select jsonb_build_array(
  pg_temp.baris('Ibu Anna', '40000000-0000-4000-8000-0000000000a0', 'cocok', 'ya', 'kosong', 'ya', null, '>65', 'sudah 2 periode'),
  pg_temp.baris('Bpk. Bima', '40000000-0000-4000-8000-0000000000b0', 'cocok', 'ya', 'tidak', 'ya', null, null, null, 'Maja'),
  pg_temp.baris('Bpk. Panitia', '40000000-0000-4000-8000-0000000000f0', 'cocok', 'ya', 'kosong', 'ya'),
  pg_temp.baris('Uji Sama Nama', null, 'ambigu', 'ya', 'ya', 'kosong',
    array['40000000-0000-4000-8000-0000000000c1', '40000000-0000-4000-8000-0000000000c2']::uuid[]),
  pg_temp.baris('Uji Tidak Ada', null, 'tidak_ditemukan', 'ya', 'ya', 'kosong'),
  pg_temp.baris('Uji Empat Error', '40000000-0000-4000-8000-0000000000e0', 'error', 'ya', 'ya', 'ya'),
  pg_temp.baris('Uji Empat Konfirmasi', '40000000-0000-4000-8000-0000000000e9', 'cocok', 'kosong', 'ya', 'kosong', null, null, 'pindahan')
) || (select jsonb_agg(pg_temp.baris('Uji Kandidat ' || lpad(i::text, 2, '0'), pg_temp.k(i), 'cocok', 'ya', 'ya', 'kosong') order by i)
      from generate_series(1, 10) as i) as v;
grant select on impor_x to authenticated;

select pg_temp.sebagai('40000000-0000-4000-8000-000000000003');
select throws_ok(
  $$ select * from public.impor_peserta_pemilihan('40000000-0000-4000-8000-000000000e01', (select v from impor_x)) $$,
  '42501', null::text, 'viewer can''t import'
);
select pg_temp.sebagai('40000000-0000-4000-8000-000000000004');
select throws_ok(
  $$ select * from public.impor_peserta_pemilihan('40000000-0000-4000-8000-000000000e01', (select v from impor_x)) $$,
  '42501', null::text, 'pemilihan:read alone can''t import'
);

select pg_temp.sebagai('40000000-0000-4000-8000-000000000001');
select is(
  (select format('%s|%s|%s', jumlah_baris, jumlah_beres, jumlah_peserta)
   from public.impor_peserta_pemilihan('40000000-0000-4000-8000-000000000e01', (select v from impor_x))),
  '17|13|13', 'the panitia imports 17 rows: 13 resolved and on the peserta list'
);
select pg_temp.sebagai(null);

select is(
  (select format('%s|%s|%s|%s', dapat_memilih, dapat_dipilih, perlu_konfirmasi_memilih, beres) from public.pemilihan_impor_baris where id = pg_temp.b('Uji Empat Error')),
  't||f|f', 'two ticks in Dapat Dipilih / Tidak Dapat Dipilih: dapat_dipilih unknown, not resolved'
);
select is(
  (select format('%s|%s|%s|%s', dapat_memilih, dapat_dipilih, perlu_konfirmasi_memilih, beres) from public.pemilihan_impor_baris where id = pg_temp.b('Uji Empat Konfirmasi')),
  'f|t|t|f', 'a blank Dapat Memilih is no, pending confirmation'
);
select is(
  (select format('%s|%s', dapat_dipilih, beres) from public.pemilihan_impor_baris where id = pg_temp.b('Bpk. Bima')),
  'f|t', 'an explicit "tidak" with a tick in Tidak Dapat Dipilih is resolved'
);
select is(
  (select beres from public.pemilihan_impor_baris where id = pg_temp.b('Uji Sama Nama')), false, 'an Ambigu row waits for the panitia'
);
select is(
  (select format('%s|%s|%s', kelompok_wilayah, alasan_tidak_dapat_dipilih, keterangan) from public.pemilihan_peserta
   where pemilihan_id = '40000000-0000-4000-8000-000000000e01' and jemaat_id = '40000000-0000-4000-8000-0000000000a0'),
  'Wil. 1|Usia >65; sudah 2 periode|sudah 2 periode', 'peserta keep the sheet, the reason (Usia + Keterangan) and the keterangan'
);
select is(
  (select format('%s|%s', kelompok_wilayah, coalesce(alasan_tidak_dapat_dipilih, '∅')) from public.pemilihan_peserta
   where pemilihan_id = '40000000-0000-4000-8000-000000000e01' and jemaat_id = '40000000-0000-4000-8000-0000000000b0'),
  'Maja|∅', 'no usia and no keterangan: no reason text'
);
select is(
  (select count(*)::int from public.pemilihan_peserta where pemilihan_id = '40000000-0000-4000-8000-000000000e01' and alasan_tidak_dapat_dipilih is not null and dapat_dipilih),
  0, 'only rows that may not be chosen carry a reason'
);
select throws_ok(
  $$ insert into public.pemilihan_peserta (pemilihan_id, jemaat_id, nama_tampilan, dapat_dipilih, alasan_tidak_dapat_dipilih)
     values ('40000000-0000-4000-8000-000000000e02', '40000000-0000-4000-8000-0000000000d0', 'X', true, 'alasan') $$,
  '23514', null::text, 'a candidate can''t carry alasan_tidak_dapat_dipilih (CHECK)'
);

-- Refused imports leave the list as it was.
select pg_temp.sebagai('40000000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select * from public.impor_peserta_pemilihan('40000000-0000-4000-8000-000000000e01', jsonb_build_array(
       pg_temp.baris('Satu', '40000000-0000-4000-8000-0000000000d0', 'cocok', 'ya', 'ya', 'kosong'),
       pg_temp.baris('Dua', '40000000-0000-4000-8000-0000000000d0', 'cocok', 'ya', 'ya', 'kosong'))) $$,
  '23505', 'Satu jemaat hanya boleh muncul sekali di daftar peserta. Ada jemaat yang dicocokkan ke lebih dari satu baris.',
  'one jemaat on two rows is refused'
);
select throws_ok(
  $$ select * from public.impor_peserta_pemilihan('40000000-0000-4000-8000-000000000e01', jsonb_build_array(
       pg_temp.baris('Salah', '40000000-0000-4000-8000-0000000000d0', 'cocok', 'ya', 'ya', 'kosong',
         array['40000000-0000-4000-8000-0000000000b0']::uuid[]))) $$,
  '22023', 'Data impor tidak valid.', 'a match outside its own candidates is refused'
);
select throws_ok(
  $$ select * from public.impor_peserta_pemilihan('40000000-0000-4000-8000-000000000e01', jsonb_build_array(
       pg_temp.baris('Tanda', '40000000-0000-4000-8000-0000000000d0', 'cocok', 'centang', 'ya', 'kosong'))) $$,
  '22023', 'Data impor tidak valid.', 'an unknown tick state is refused (CHECK)'
);
select throws_ok(
  $$ select * from public.impor_peserta_pemilihan('40000000-0000-4000-8000-000000000e01', jsonb_build_array(
       pg_temp.baris('Hilang', '40000000-0000-4000-8000-00000000ffff', 'cocok', 'ya', 'ya', 'kosong'))) $$,
  '22023', 'Ada jemaat yang tidak ditemukan. Muat ulang halaman, lalu impor lagi.', 'an unknown jemaat is refused'
);
select throws_ok(
  $$ select * from public.impor_peserta_pemilihan('40000000-0000-4000-8000-000000000e01', '[]'::jsonb) $$,
  '22023', 'Tidak ada baris peserta untuk diimpor.', 'an empty import is refused'
);
select throws_ok(
  $$ select * from public.impor_peserta_pemilihan('40000000-0000-4000-8000-000000000e01', '{"a": 1}'::jsonb) $$,
  '22023', 'Data impor tidak valid.', 'a non-array import is refused'
);
select throws_ok(
  $$ select * from public.impor_peserta_pemilihan('40000000-0000-4000-8000-00000000ffff', (select v from impor_x)) $$,
  'P0002', 'Pemilihan tidak ditemukan.', 'an unknown election'
);
select pg_temp.sebagai(null);
select is(
  (select format('%s|%s', (select count(*) from public.pemilihan_impor_baris where pemilihan_id = '40000000-0000-4000-8000-000000000e01'),
                          (select count(*) from public.pemilihan_peserta where pemilihan_id = '40000000-0000-4000-8000-000000000e01'))),
  '17|13', '... and every refused import left the list as it was'
);

-- ---------------------------------------------------------------------------
-- Opening waits for every row
-- ---------------------------------------------------------------------------
select pg_temp.sebagai('40000000-0000-4000-8000-000000000001');
select throws_ok(
  $$ update public.pemilihan set status = 'dibuka' where id = '40000000-0000-4000-8000-000000000e01' $$,
  'PM011', 'Masih ada 4 baris impor peserta yang belum beres. Selesaikan dulu sebelum membuka pemilihan.',
  'opening is refused while rows are unresolved'
);
select is(
  (select baris_belum_beres from public.pemilihan_ringkasan() where pemilihan_id = '40000000-0000-4000-8000-000000000e01'),
  4, 'pemilihan_ringkasan counts the unresolved rows'
);

-- ---------------------------------------------------------------------------
-- Resolving rows
-- ---------------------------------------------------------------------------
select pg_temp.sebagai('40000000-0000-4000-8000-000000000004');
select throws_ok(
  $$ select * from public.perbarui_baris_impor(pg_temp.b('Uji Sama Nama'), '40000000-0000-4000-8000-0000000000c1') $$,
  '42501', null::text, 'pemilihan:read alone can''t resolve a row'
);
select is(
  (select count(*)::int from public.pemilihan_impor_baris where pemilihan_id = '40000000-0000-4000-8000-000000000e01'),
  17, '... but may read the import rows'
);

select pg_temp.sebagai('40000000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select * from public.perbarui_baris_impor(pg_temp.b('Uji Sama Nama'), '40000000-0000-4000-8000-0000000000a0') $$,
  '23505', 'Jemaat ini sudah dipakai di baris lain. Satu jemaat hanya boleh muncul sekali.',
  'a jemaat already on another row can''t be picked'
);
select is(
  (select format('%s|%s', jemaat_id, beres) from public.perbarui_baris_impor(pg_temp.b('Uji Sama Nama'), '40000000-0000-4000-8000-0000000000c1')),
  '40000000-0000-4000-8000-0000000000c1|t', 'picking the jemaat for an Ambigu row resolves it'
);
select is(
  (select format('%s|%s', nama_tampilan, dapat_dipilih) from public.pemilihan_peserta
   where pemilihan_id = '40000000-0000-4000-8000-000000000e01' and jemaat_id = '40000000-0000-4000-8000-0000000000c1'),
  'Uji Sama Nama|t', '... and puts it on the peserta list under the name from the file'
);
select is(
  (select format('%s|%s', jemaat_id, beres) from public.perbarui_baris_impor(pg_temp.b('Uji Sama Nama'), '40000000-0000-4000-8000-0000000000c2')),
  '40000000-0000-4000-8000-0000000000c2|t', 'changing the pick moves the peserta row'
);
select is(
  (select array_agg(jemaat_id::text order by jemaat_id) from public.pemilihan_peserta
   where pemilihan_id = '40000000-0000-4000-8000-000000000e01' and jemaat_id in ('40000000-0000-4000-8000-0000000000c1', '40000000-0000-4000-8000-0000000000c2')),
  array['40000000-0000-4000-8000-0000000000c2'], '... the first pick is off the list'
);
select throws_ok(
  $$ select * from public.perbarui_baris_impor(pg_temp.b('Uji Tidak Ada'), '40000000-0000-4000-8000-00000000ffff') $$,
  'P0002', 'Jemaat tidak ditemukan.', 'an unknown jemaat can''t be picked'
);
select is(
  (select format('%s|%s', dikeluarkan, beres) from public.perbarui_baris_impor(pg_temp.b('Uji Tidak Ada'), p_dikeluarkan => true)),
  't|t', 'leaving a Tidak ditemukan row out resolves it'
);
select is(
  (select format('%s|%s', dapat_dipilih, beres) from public.perbarui_baris_impor(pg_temp.b('Uji Empat Error'), p_dapat_dipilih => false)),
  'f|t', 'setting Tidak Dapat Dipilih resolves an error row'
);
select is(
  (select format('%s|%s|%s', dapat_memilih, perlu_konfirmasi_memilih, beres)
   from public.perbarui_baris_impor(pg_temp.b('Uji Empat Konfirmasi'), p_dapat_memilih => false)),
  'f|f|t', 'confirming a blank Dapat Memilih resolves it'
);
select is(
  (select format('%s|%s', dapat_memilih, dapat_dipilih) from public.pemilihan_peserta
   where pemilihan_id = '40000000-0000-4000-8000-000000000e01' and jemaat_id = '40000000-0000-4000-8000-0000000000e9'),
  'f|t', '... and the peserta row has the confirmed values'
);
select is(
  (select format('%s|%s', dikeluarkan, beres) from public.perbarui_baris_impor(pg_temp.b('Bpk. Bima'), p_dikeluarkan => true)),
  't|t', 'a resolved row can be left out'
);
select is(
  (select count(*)::int from public.pemilihan_peserta
   where pemilihan_id = '40000000-0000-4000-8000-000000000e01' and jemaat_id = '40000000-0000-4000-8000-0000000000b0'),
  0, '... and leaves the peserta list'
);
select is(
  (select format('%s|%s', dikeluarkan, beres) from public.perbarui_baris_impor(pg_temp.b('Bpk. Bima'), p_dikeluarkan => false)),
  'f|t', '... and can be taken back'
);
select is(
  (select count(*)::int from public.pemilihan_peserta
   where pemilihan_id = '40000000-0000-4000-8000-000000000e01' and jemaat_id = '40000000-0000-4000-8000-0000000000b0'),
  1, '... onto the peserta list again'
);
select throws_ok(
  $$ insert into public.pemilihan_impor_baris (pemilihan_id, urutan, sumber, kelompok_wilayah, baris, nama, tanda_memilih, tanda_dipilih, tanda_tidak_dipilih, kategori)
     values ('40000000-0000-4000-8000-000000000e01', 99, 's', 'k', 1, 'n', 'ya', 'ya', 'kosong', 'cocok') $$,
  '42501', null::text, 'the panitia can''t write import rows directly'
);
select is(
  (select count(*)::int from public.pemilihan_impor_baris where pemilihan_id = '40000000-0000-4000-8000-000000000e01' and not beres),
  0, 'every row is resolved now'
);

-- ---------------------------------------------------------------------------
-- Opening, then frozen
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ update public.pemilihan set status = 'dibuka' where id = '40000000-0000-4000-8000-000000000e01' $$,
  'the election opens once every row is resolved'
);
select throws_ok(
  $$ select * from public.impor_peserta_pemilihan('40000000-0000-4000-8000-000000000e01', (select v from impor_x)) $$,
  'PM010', 'Daftar peserta tidak bisa diubah setelah pemilihan dibuka.', 'no re-import after opening'
);
select throws_ok(
  $$ select * from public.perbarui_baris_impor(pg_temp.b('Uji Empat Error'), p_dapat_dipilih => true) $$,
  'PM010', 'Daftar peserta tidak bisa diubah setelah pemilihan dibuka.', 'no row change after opening'
);
select pg_temp.sebagai(null);
select throws_ok(
  $$ update public.pemilihan_impor_baris set dikeluarkan = true where pemilihan_id = '40000000-0000-4000-8000-000000000e01' $$,
  'PM010', 'Daftar peserta tidak bisa diubah setelah pemilihan dibuka.', 'the guard holds even for the table owner'
);

-- ---------------------------------------------------------------------------
-- Assisted voting reads
-- ---------------------------------------------------------------------------
select pg_temp.sebagai('40000000-0000-4000-8000-000000000001');
select is(
  (select array_agg(nama_tampilan order by nama_tampilan) from public.pemilihan_belum_memilih('40000000-0000-4000-8000-000000000e01')
   where jemaat_id in ('40000000-0000-4000-8000-0000000000a0', '40000000-0000-4000-8000-0000000000b0', '40000000-0000-4000-8000-0000000000f0')),
  array['Bpk. Bima', 'Ibu Anna'], 'voters not yet voted, without the panitia''s own record'
);
select is(
  (select count(*)::int from public.pemilihan_belum_memilih('40000000-0000-4000-8000-000000000e01') b
   join public.pemilihan_peserta pp on pp.pemilihan_id = '40000000-0000-4000-8000-000000000e01' and pp.jemaat_id = b.jemaat_id
   where not pp.dapat_memilih),
  0, 'only peserta with dapat_memilih are listed'
);
select lives_ok(
  $$ select * from public.berikan_suara_dibantu('40000000-0000-4000-8000-000000000e01', '40000000-0000-4000-8000-0000000000b0', 'F-001',
       array(select pg_temp.k(i) from generate_series(1, 10) as i), array(select pg_temp.k(i) from generate_series(1, 5) as i)) $$,
  'the panitia records Bima''s paper ballot'
);
select is(
  (select count(*)::int from public.pemilihan_belum_memilih('40000000-0000-4000-8000-000000000e01') where jemaat_id = '40000000-0000-4000-8000-0000000000b0'),
  0, 'a voter who voted is no longer listed'
);
select throws_ok(
  $$ select * from public.pemilihan_belum_memilih('40000000-0000-4000-8000-000000000e02') $$,
  'PM001', 'Pemungutan suara belum dibuka.', 'nothing to assist in a draft'
);
select is(
  (select count(*)::int from public.pemilihan_kandidat_admin('40000000-0000-4000-8000-000000000e01')), 12,
  'pemilihan_kandidat_admin lists the candidates (10 + the two resolved ones)'
);

select pg_temp.sebagai('40000000-0000-4000-8000-000000000005');
select is(
  (select format('%s|%s', nama, status) from public.pemilihan_untuk_bantu('40000000-0000-4000-8000-000000000e01')),
  'Pemilihan Uji Impor|dibuka', 'pemilihan_bantu:create alone sees the election on the assisted page'
);
select is(
  (select count(*)::int from public.pemilihan_kandidat_admin('40000000-0000-4000-8000-000000000e01')), 12,
  '... and the candidates'
);
select ok(
  (select count(*) from public.pemilihan_belum_memilih('40000000-0000-4000-8000-000000000e01')) > 0, '... and the voters to assist'
);
select is((select count(*)::int from public.pemilihan), 0, '... but not the election table (no pemilihan:read)');

select pg_temp.sebagai('40000000-0000-4000-8000-000000000004');
select throws_ok(
  $$ select * from public.pemilihan_belum_memilih('40000000-0000-4000-8000-000000000e01') $$,
  '42501', null::text, 'pemilihan:read alone can''t list who hasn''t voted'
);
select throws_ok(
  $$ select * from public.pemilihan_untuk_bantu('40000000-0000-4000-8000-000000000e01') $$,
  '42501', null::text, '... nor open the assisted page'
);
select is(
  (select count(*)::int from public.pemilihan_kandidat_admin('40000000-0000-4000-8000-000000000e01')), 12,
  'pemilihan:read lists the candidates'
);

-- ---------------------------------------------------------------------------
-- Other reads
-- ---------------------------------------------------------------------------
select is(
  (select format('%s|%s|%s|%s', total_pemilih, sudah_memilih, persen, baris_belum_beres)
   from public.pemilihan_ringkasan() where pemilihan_id = '40000000-0000-4000-8000-000000000e01'),
  '15|1|6.7|0', 'pemilihan_ringkasan: voters, voted, percentage, unresolved'
);
select is(
  (select format('%s|%s|%s', punya_akun, coalesce(akun_jemaat_id::text, '∅'), coalesce(username, '∅'))
   from public.pemilihan_peserta_akun('40000000-0000-4000-8000-000000000e01') where jemaat_id = '40000000-0000-4000-8000-0000000000a0'),
  't|40000000-0000-4000-8000-000000000006|uji.anna', 'a jemaat-only account: its id and username'
);
select is(
  (select format('%s|%s', punya_akun, coalesce(akun_jemaat_id::text, '∅'))
   from public.pemilihan_peserta_akun('40000000-0000-4000-8000-000000000e01') where jemaat_id = '40000000-0000-4000-8000-0000000000f0'),
  't|∅', 'a staff account linked to a peserta: no id (the panitia can''t reset it)'
);
select is(
  (select punya_akun from public.pemilihan_peserta_akun('40000000-0000-4000-8000-000000000e01') where jemaat_id = '40000000-0000-4000-8000-0000000000b0'),
  false, 'a voter without an account'
);
select is(
  (select format('%s|%s', coalesce(dibuat_oleh, '∅'), dibuka_oleh) from public.pemilihan_pencatat('40000000-0000-4000-8000-000000000e01')),
  '∅|Panitia Empat Belas', 'pemilihan_pencatat names who opened it'
);
select throws_ok(
  $$ select * from public.pemilihan_daftar_jemaat() $$, '42501', null::text, 'pemilihan:read alone can''t list Data Jemaat'
);
select throws_ok(
  $$ select * from public.pemilihan_jemaat_akun(array['40000000-0000-4000-8000-0000000000b0']::uuid[]) $$, '42501', null::text,
  '... nor check accounts for creating them'
);

select pg_temp.sebagai('40000000-0000-4000-8000-000000000001');
select is(
  (select format('%s|%s', alamat, wilayah) from public.pemilihan_daftar_jemaat() where id = '40000000-0000-4000-8000-0000000000c1'),
  'Jl. Mandala 1|Wilayah Uji Mandala', 'the panitia lists Data Jemaat with address and wilayah (Domisili''s hint)'
);
select is(
  (select array_agg(format('%s:%s:%s', nama, punya_akun, pemilih) order by nama)
   from public.pemilihan_jemaat_akun(array['40000000-0000-4000-8000-0000000000a0', '40000000-0000-4000-8000-0000000000b0', '40000000-0000-4000-8000-0000000000d0']::uuid[])),
  array['Uji Empat Anna:t:t', 'Uji Empat Bima:f:t', 'Uji Empat Pengganti:f:f'],
  'pemilihan_jemaat_akun: account and voter flags'
);

select pg_temp.sebagai('40000000-0000-4000-8000-000000000003');
select throws_ok($$ select * from public.pemilihan_ringkasan() $$, '42501', null::text, 'viewer: no ringkasan');
select throws_ok($$ select * from public.pemilihan_pencatat('40000000-0000-4000-8000-000000000e01') $$, '42501', null::text, 'viewer: no pencatat');
select throws_ok($$ select * from public.pemilihan_peserta_akun('40000000-0000-4000-8000-000000000e01') $$, '42501', null::text, 'viewer: no accounts');
select throws_ok($$ select * from public.pemilihan_kandidat_admin('40000000-0000-4000-8000-000000000e01') $$, '42501', null::text, 'viewer: no candidates');
select is((select count(*)::int from public.pemilihan_impor_baris), 0, 'viewer sees no import rows');

select pg_temp.sebagai('40000000-0000-4000-8000-000000000006');
select throws_ok($$ select * from public.pemilihan_belum_memilih('40000000-0000-4000-8000-000000000e01') $$, '42501', null::text, 'a jemaat account can''t list voters');

-- ---------------------------------------------------------------------------
-- Draft deletion takes the import rows along; the role editor's scope
-- ---------------------------------------------------------------------------
select pg_temp.sebagai(null);
insert into public.pemilihan (id, nama) values ('40000000-0000-4000-8000-000000000e03', 'Pemilihan Uji Hapus');
select pg_temp.sebagai('40000000-0000-4000-8000-000000000001');
select lives_ok(
  $$ select * from public.impor_peserta_pemilihan('40000000-0000-4000-8000-000000000e03', jsonb_build_array(
       pg_temp.baris('Satu', '40000000-0000-4000-8000-0000000000d0', 'cocok', 'ya', 'ya', 'kosong'))) $$,
  'importing into another draft'
);
select lives_ok($$ delete from public.pemilihan where id = '40000000-0000-4000-8000-000000000e03' $$, 'a draft with an import can be deleted');
select pg_temp.sebagai(null);
select is(
  (select count(*)::int from public.pemilihan_impor_baris where pemilihan_id = '40000000-0000-4000-8000-000000000e03'),
  0, '... its import rows went with it'
);

select pg_temp.sebagai('40000000-0000-4000-8000-000000000002');
select lives_ok(
  $$ select public.set_role_ui_permissions('40000000-0000-4000-8000-0000000000a8',
       array(select id from public.permissions where (resource, action) in (('pemilihan', 'read'), ('pemilihan_hasil', 'read'), ('pemilihan_bantu', 'create')))) $$,
  'the role editor saves pemilihan permissions'
);
select pg_temp.sebagai(null);
select is(
  (select array_agg(p.resource || ':' || p.action order by p.resource) from public.role_permissions rp join public.permissions p on p.id = rp.permission_id
   where rp.role_id = '40000000-0000-4000-8000-0000000000a8'),
  array['pemilihan:read', 'pemilihan_bantu:create', 'pemilihan_hasil:read'], '... and they are kept'
);
select pg_temp.sebagai('40000000-0000-4000-8000-000000000002');
select lives_ok(
  $$ select public.set_role_ui_permissions('40000000-0000-4000-8000-0000000000a8', array[]::uuid[]) $$,
  'saving an empty set'
);
select pg_temp.sebagai(null);
select is(
  (select count(*)::int from public.role_permissions where role_id = '40000000-0000-4000-8000-0000000000a8'),
  0, '... removes them (they are within the editor''s scope)'
);
select is(
  (select count(*)::int from public.role_permissions rp join public.roles r on r.id = rp.role_id join public.permissions p on p.id = rp.permission_id
   where r.name = 'panitia_pemilihan' and p.resource like 'pemilihan%'),
  6, 'panitia_pemilihan still holds its six pemilihan permissions'
);

select * from finish();
rollback;
