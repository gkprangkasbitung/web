-- Pemilihan Majelis Jemaat backend (stage 14a; migration 0038): the secret
-- ballot, casting a vote (portal and assisted), the guards, and the results.
--
-- now() is fixed for the whole transaction, so the voting windows below are
-- exact: E1 opens at exactly now() (start inclusive), E4 closes at exactly
-- now() (end exclusive).
--
-- People: voters A, B, D (portal accounts), V1, V2 (no account), panitia P
-- (role panitia_pemilihan, also a voter of E1 through jemaat JP), C (peserta
-- that may neither vote nor be chosen), N (no peserta row at all), E (voter
-- of E3–E5). S = super_admin, ADM = admin (no pemilihan permission).
-- Candidates K01..K32 ("Ibu Anita Uji", "Bpk. Budi Uji", then "Sdr./Sdri.
-- Calon Uji 03..32"); KZ is a candidate of E2 only.
begin;
create extension if not exists pgtap with schema extensions;

select plan(150);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres). Rolled back at the end.
-- ---------------------------------------------------------------------------

-- Candidate K<i>'s id.
create function pg_temp.k(i int) returns uuid language sql immutable as $$
  select ('38000000-0000-4000-8000-0000000001' || lpad(i::text, 2, '0'))::uuid;
$$;
-- Candidates K<a>..K<b>, in order.
create function pg_temp.calon(a int, b int) returns uuid[] language sql immutable as $$
  select coalesce(array_agg(pg_temp.k(i) order by i), '{}') from generate_series(a, b) as i;
$$;
-- Acts as an account (null: back to postgres).
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
grant execute on function pg_temp.k(int), pg_temp.calon(int, int), pg_temp.sebagai(uuid) to authenticated, service_role;

insert into auth.users (id, email, raw_user_meta_data) values
  ('38000000-0000-4000-8000-000000000001', 'pemilihan-a@test.local', '{}'),
  ('38000000-0000-4000-8000-000000000002', 'pemilihan-b@test.local', '{}'),
  ('38000000-0000-4000-8000-000000000003', 'pemilihan-c@test.local', '{}'),
  ('38000000-0000-4000-8000-000000000004', 'pemilihan-d@test.local', '{}'),
  ('38000000-0000-4000-8000-000000000005', 'pemilihan-n@test.local', '{}'),
  ('38000000-0000-4000-8000-000000000006', 'pemilihan-p@test.local', '{"full_name": "Panitia Uji Pertama"}'),
  ('38000000-0000-4000-8000-000000000007', 'pemilihan-s@test.local', '{"full_name": "Super Admin Uji"}'),
  ('38000000-0000-4000-8000-000000000008', 'pemilihan-adm@test.local', '{}'),
  ('38000000-0000-4000-8000-000000000009', 'pemilihan-viewer@test.local', '{}'),
  ('38000000-0000-4000-8000-00000000000a', 'pemilihan-e@test.local', '{}');

insert into public.user_roles (user_id, role_id)
select v.user_id::uuid, r.id
from (
  values
    ('38000000-0000-4000-8000-000000000006', 'panitia_pemilihan'),
    ('38000000-0000-4000-8000-000000000007', 'super_admin'),
    ('38000000-0000-4000-8000-000000000008', 'admin'),
    ('38000000-0000-4000-8000-000000000009', 'viewer')
) as v (user_id, role_name)
join public.roles r on r.name = v.role_name;

insert into public.jemaat (id, nama) values
  ('38000000-0000-4000-8000-0000000000a1', 'Uji Pemilih Anna'),
  ('38000000-0000-4000-8000-0000000000b1', 'Uji Pemilih Bima'),
  ('38000000-0000-4000-8000-0000000000c1', 'Uji Peserta Citra'),
  ('38000000-0000-4000-8000-0000000000d1', 'Uji Pemilih Dewi'),
  ('38000000-0000-4000-8000-0000000000e1', 'Uji Pemilih Eko'),
  ('38000000-0000-4000-8000-0000000000f1', 'Uji Bukan Peserta Nora'),
  ('38000000-0000-4000-8000-0000000000f2', 'Uji Panitia Paulus'),
  ('38000000-0000-4000-8000-0000000000f3', 'Uji Pemilih Vina'),
  ('38000000-0000-4000-8000-0000000000f4', 'Uji Pemilih Wawan'),
  ('38000000-0000-4000-8000-0000000000f5', 'Uji Calon Lain Zaki');
insert into public.jemaat (id, nama)
select pg_temp.k(i), 'Uji Calon ' || lpad(i::text, 2, '0') from generate_series(1, 32) as i;

update public.profiles p set jemaat_id = v.jemaat_id::uuid
from (
  values
    ('38000000-0000-4000-8000-000000000001', '38000000-0000-4000-8000-0000000000a1'),
    ('38000000-0000-4000-8000-000000000002', '38000000-0000-4000-8000-0000000000b1'),
    ('38000000-0000-4000-8000-000000000003', '38000000-0000-4000-8000-0000000000c1'),
    ('38000000-0000-4000-8000-000000000004', '38000000-0000-4000-8000-0000000000d1'),
    ('38000000-0000-4000-8000-000000000005', '38000000-0000-4000-8000-0000000000f1'),
    ('38000000-0000-4000-8000-000000000006', '38000000-0000-4000-8000-0000000000f2'),
    ('38000000-0000-4000-8000-00000000000a', '38000000-0000-4000-8000-0000000000e1')
) as v (user_id, jemaat_id)
where p.id = v.user_id::uuid;

-- E1: the main election, open from exactly now() for an hour.
-- E2: a draft. E3: opened, but its window starts in an hour. E4: its window
-- ended exactly now(). E5: closed.
insert into public.pemilihan (id, nama, periode, dibuka_pada, ditutup_pada) values
  ('38000000-0000-4000-8000-000000000e01', 'Pemilihan Uji Utama', '2027–2031', now(), now() + interval '1 hour'),
  ('38000000-0000-4000-8000-000000000e02', 'Pemilihan Uji Draft', null, null, null),
  ('38000000-0000-4000-8000-000000000e03', 'Pemilihan Uji Belum Dibuka', null, now() + interval '1 hour', now() + interval '2 hours'),
  ('38000000-0000-4000-8000-000000000e04', 'Pemilihan Uji Lewat Jadwal', null, now() - interval '2 hours', now() + interval '1 hour'),
  ('38000000-0000-4000-8000-000000000e05', 'Pemilihan Uji Ditutup', null, now() - interval '1 hour', now() + interval '1 hour');

insert into public.pemilihan_peserta (pemilihan_id, jemaat_id, nama_tampilan, dapat_memilih, dapat_dipilih) values
  ('38000000-0000-4000-8000-000000000e01', '38000000-0000-4000-8000-0000000000a1', 'Ibu Anna', true, false),
  ('38000000-0000-4000-8000-000000000e01', '38000000-0000-4000-8000-0000000000b1', 'Bpk. Bima', true, false),
  ('38000000-0000-4000-8000-000000000e01', '38000000-0000-4000-8000-0000000000c1', 'Ibu Citra', false, false),
  ('38000000-0000-4000-8000-000000000e01', '38000000-0000-4000-8000-0000000000d1', 'Ibu Dewi', true, false),
  ('38000000-0000-4000-8000-000000000e01', '38000000-0000-4000-8000-0000000000f2', 'Bpk. Paulus', true, false),
  ('38000000-0000-4000-8000-000000000e01', '38000000-0000-4000-8000-0000000000f3', 'Ibu Vina', true, false),
  ('38000000-0000-4000-8000-000000000e01', '38000000-0000-4000-8000-0000000000f4', 'Bpk. Wawan', true, false),
  ('38000000-0000-4000-8000-000000000e02', '38000000-0000-4000-8000-0000000000a1', 'Ibu Anna', true, false),
  ('38000000-0000-4000-8000-000000000e02', '38000000-0000-4000-8000-0000000000f5', 'Bpk. Zaki', false, true);
insert into public.pemilihan_peserta (pemilihan_id, jemaat_id, nama_tampilan, dapat_dipilih)
select '38000000-0000-4000-8000-000000000e01', pg_temp.k(i),
  case i
    when 1 then 'Ibu Anita Uji'
    when 2 then 'Bpk. Budi Uji'
    else case when i % 2 = 0 then 'Sdr. ' else 'Sdri. ' end || 'Calon Uji ' || lpad(i::text, 2, '0')
  end,
  true
from generate_series(1, 32) as i;
insert into public.pemilihan_peserta (pemilihan_id, jemaat_id, nama_tampilan, dapat_memilih, dapat_dipilih)
select e.id::uuid, x.jemaat_id, x.nama, x.memilih, x.dipilih
from (
  values
    ('38000000-0000-4000-8000-000000000e03'),
    ('38000000-0000-4000-8000-000000000e04'),
    ('38000000-0000-4000-8000-000000000e05')
) as e (id)
cross join lateral (
  select '38000000-0000-4000-8000-0000000000e1'::uuid as jemaat_id, 'Bpk. Eko' as nama, true as memilih, false as dipilih
  union all
  select pg_temp.k(i), 'Calon ' || i, false, true from generate_series(1, 10) as i
) as x;

update public.pemilihan set status = 'dibuka'
where id in (
  '38000000-0000-4000-8000-000000000e01', '38000000-0000-4000-8000-000000000e03',
  '38000000-0000-4000-8000-000000000e04', '38000000-0000-4000-8000-000000000e05'
);
update public.pemilihan set status = 'ditutup' where id = '38000000-0000-4000-8000-000000000e05';
-- E4's window ends exactly now(); a schedule can't change after draft, so
-- the guard steps aside for this one fixture.
alter table public.pemilihan disable trigger pemilihan_guard;
update public.pemilihan set ditutup_pada = now() where id = '38000000-0000-4000-8000-000000000e04';
alter table public.pemilihan enable trigger pemilihan_guard;

-- ---------------------------------------------------------------------------
-- Catalog: the secret ballot's shape
-- ---------------------------------------------------------------------------
select is(
  (select array_agg(attname::text order by attnum) from pg_attribute
   where attrelid = 'public.pemilihan_suara'::regclass and attnum > 0 and not attisdropped),
  array['id', 'pemilihan_id', 'kontes', 'kandidat_jemaat_id'],
  'pemilihan_suara has exactly id, pemilihan_id, kontes, kandidat_jemaat_id (no voter, no timestamp)'
);
select is(
  (select pg_get_expr(adbin, adrelid) from pg_attrdef
   where adrelid = 'public.pemilihan_suara'::regclass
     and adnum = (select attnum from pg_attribute where attrelid = 'public.pemilihan_suara'::regclass and attname = 'id')),
  'gen_random_uuid()', 'pemilihan_suara.id defaults to a random v4 uuid'
);
select is(
  (select count(*)::int from pg_attrdef
   where adrelid = 'public.pemilihan_suara'::regclass
     and adnum <> (select attnum from pg_attribute where attrelid = 'public.pemilihan_suara'::regclass and attname = 'id')),
  0, 'no other pemilihan_suara column has a default'
);
select is(
  (select count(*)::int from pg_attribute
   where attrelid in ('public.pemilihan_suara'::regclass, 'public.pemilihan_partisipasi'::regclass)
     and attnum > 0 and (attidentity <> '' or attgenerated <> '')),
  0, 'no identity or generated column in pemilihan_suara or pemilihan_partisipasi'
);
select is(
  (select count(*)::int from pg_depend d join pg_class s on s.oid = d.objid and s.relkind = 'S'
   where d.refobjid in ('public.pemilihan_suara'::regclass, 'public.pemilihan_partisipasi'::regclass)),
  0, 'no sequence belongs to pemilihan_suara or pemilihan_partisipasi'
);
select is(
  (select array_agg(c.relname::text) from pg_index i join pg_class c on c.oid = i.indexrelid
   where i.indrelid = 'public.pemilihan_suara'::regclass),
  array['pemilihan_suara_pkey'], 'pemilihan_suara has no index besides its primary key'
);
select is(
  (select array_agg(distinct confrelid::regclass::text order by confrelid::regclass::text) from pg_constraint
   where contype = 'f' and conrelid in ('public.pemilihan_suara'::regclass, 'public.pemilihan_partisipasi'::regclass)),
  array['pemilihan', 'pemilihan_kontes'],
  'suara and partisipasi reference only the election and contest rows, never a person (jemaat, peserta, profiles, users)'
);
select is(
  (select count(*)::int from pg_constraint
   where contype = 'f' and confrelid in ('public.pemilihan_suara'::regclass, 'public.pemilihan_partisipasi'::regclass)),
  0, 'nothing references pemilihan_suara or pemilihan_partisipasi'
);
select is(
  (select array_agg(tgname::text order by tgname) from pg_trigger
   where tgrelid = 'public.pemilihan_suara'::regclass and not tgisinternal),
  array['pemilihan_final', 'pemilihan_final_truncate'], 'pemilihan_suara has only the "final" triggers'
);
select is(
  (select array_agg(tgname::text order by tgname) from pg_trigger
   where tgrelid = 'public.pemilihan_partisipasi'::regclass and not tgisinternal),
  array['pemilihan_final', 'pemilihan_final_truncate'], 'pemilihan_partisipasi has only the "final" triggers'
);
select is(
  (select count(*)::int from pg_class
   where oid in ('public.pemilihan'::regclass, 'public.pemilihan_kontes'::regclass, 'public.pemilihan_peserta'::regclass,
                 'public.pemilihan_partisipasi'::regclass, 'public.pemilihan_suara'::regclass)
     and relrowsecurity),
  5, 'RLS is enabled on all five pemilihan tables'
);
select is(
  (select count(*)::int from pg_policies
   where schemaname = 'public' and tablename in ('pemilihan_suara', 'pemilihan_partisipasi')),
  0, 'pemilihan_suara and pemilihan_partisipasi have no policy at all'
);
select is(
  (select count(*)::int
   from unnest(array['anon', 'authenticated', 'service_role']) as r (role),
     unnest(array['public.pemilihan_suara', 'public.pemilihan_partisipasi']) as t (tbl),
     unnest(array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']) as p (priv)
   where has_table_privilege(r.role, t.tbl, p.priv)),
  0, 'anon, authenticated, and service_role hold no privilege on suara or partisipasi'
);
select is(
  (select count(*)::int from pg_proc
   where oid in (
     'portal.pemilihan_aktif_saya()'::regprocedure, 'portal.kandidat(uuid)'::regprocedure,
     'portal.berikan_suara(uuid, uuid[], uuid[])'::regprocedure, 'portal.hasil_pemilihan(uuid)'::regprocedure,
     'public.berikan_suara_dibantu(uuid, uuid, text, uuid[], uuid[])'::regprocedure,
     'public.hasil_partisipasi(uuid)'::regprocedure, 'public.hasil_suara(uuid)'::regprocedure,
     'private.pemilihan_catat_suara(uuid, uuid, text, uuid, text, uuid[], uuid[])'::regprocedure,
     'private.pemilihan_rekap(uuid)'::regprocedure,
     'private.pemilihan_guard()'::regprocedure, 'private.pemilihan_peserta_guard()'::regprocedure
   ) and prosecdef and proconfig = array['search_path=""']),
  11, 'every pemilihan function that reads or writes data is security definer with an empty search_path'
);
select is(
  (select array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text collate "C") from pg_proc p
   where (p.pronamespace = 'portal'::regnamespace or p.pronamespace = 'public'::regnamespace or p.pronamespace = 'private'::regnamespace)
     and (p.proname ~ 'pemilihan|suara|kandidat|partisipasi')
     and has_function_privilege('authenticated', p.oid, 'execute')),
  -- Stage 14b (0040) added the panitia's functions; pemilihan_panitia.test.sql covers them.
  array[
    'berikan_suara_dibantu(uuid,uuid,text,uuid[],uuid[])', 'hasil_partisipasi(uuid)', 'hasil_suara(uuid)',
    'impor_peserta_pemilihan(uuid,jsonb)', 'pemilihan_belum_memilih(uuid)', 'pemilihan_daftar_jemaat()',
    'pemilihan_jemaat_akun(uuid[])', 'pemilihan_kandidat_admin(uuid)', 'pemilihan_pencatat(uuid)',
    'pemilihan_peserta_akun(uuid)', 'pemilihan_ringkasan()', 'pemilihan_untuk_bantu(uuid)',
    'portal.berikan_suara(uuid,uuid[],uuid[])', 'portal.hasil_pemilihan(uuid)', 'portal.kandidat(uuid)',
    'portal.pemilihan_aktif_saya()'
  ],
  'authenticated can execute exactly the pemilihan API functions (seven from 14a, nine from 14b), none of the private helpers'
);
select is(
  (select count(*)::int from pg_proc p
   where (p.pronamespace in ('portal'::regnamespace, 'public'::regnamespace, 'private'::regnamespace))
     and (p.proname ~ 'pemilihan|suara|kandidat|partisipasi')
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('service_role', p.oid, 'execute'))),
  0, 'anon and service_role can execute no pemilihan function'
);
select is(
  (select count(*)::int from pg_proc p
   where (p.proname ~ 'pemilihan|suara|kandidat|partisipasi') and p.prosrc ~* 'activity_logs'),
  0, 'no pemilihan function writes the activity log (the app does, without choices)'
);

-- ---------------------------------------------------------------------------
-- Config, permissions, role
-- ---------------------------------------------------------------------------
select is(
  (select array_agg(format('%s:%s-%s', kode, min_pilih, max_pilih) order by urutan) from public.pemilihan_kontes),
  array['penatua:10-30', 'ppj:5-15'], 'the two contests are seeded: Penatua 10–30, PPJ 5–15'
);
select is(
  (select array_agg(nama order by urutan) from public.pemilihan_kontes),
  array['Penatua (Majelis Jemaat)', 'PPJ (Pengawas Perbendaharaan Jemaat)'], 'contest names'
);
select throws_ok(
  $$ update public.pemilihan_kontes set min_pilih = 31 where kode = 'penatua' $$,
  '23514', null::text, 'a contest minimum above its maximum is refused'
);
select throws_ok(
  $$ insert into public.pemilihan_kontes (kode, nama, min_pilih, max_pilih, urutan) values ('lain', 'Lain', 1, 2, 3) $$,
  '23514', null::text, 'no third contest'
);
select is(
  (select array_agg(p.resource || ':' || p.action order by p.resource, p.action)
   from public.role_permissions rp
   join public.roles r on r.id = rp.role_id
   join public.permissions p on p.id = rp.permission_id
   where r.name = 'panitia_pemilihan'),
  array['pemilihan:create', 'pemilihan:delete', 'pemilihan:read', 'pemilihan:update', 'pemilihan_bantu:create', 'pemilihan_hasil:read'],
  'panitia_pemilihan holds exactly the six pemilihan permissions'
);
select is(
  (select count(*)::int from public.role_permissions rp
   join public.roles r on r.id = rp.role_id
   join public.permissions p on p.id = rp.permission_id
   where r.name = 'super_admin' and p.resource in ('pemilihan', 'pemilihan_hasil', 'pemilihan_bantu')),
  6, 'super_admin holds all six too'
);
select is(
  (select array_agg(distinct r.name order by r.name) from public.role_permissions rp
   join public.roles r on r.id = rp.role_id
   join public.permissions p on p.id = rp.permission_id
   where p.resource in ('pemilihan', 'pemilihan_hasil', 'pemilihan_bantu')),
  array['panitia_pemilihan', 'super_admin'], 'no other role holds a pemilihan permission'
);

-- ---------------------------------------------------------------------------
-- Voting: the happy path and the secret ballot
-- ---------------------------------------------------------------------------
select pg_temp.sebagai('38000000-0000-4000-8000-000000000001');
-- A: the lower bounds (10 + 5), with the same people in both contests.
select is(
  (select waktu from portal.berikan_suara('38000000-0000-4000-8000-000000000e01', pg_temp.calon(1, 10), pg_temp.calon(1, 5))),
  now(), 'A: 10 Penatua + 5 PPJ (the lower bounds, the same people in both contests) is accepted, at the opening instant'
);
select throws_ok(
  $$ select * from portal.berikan_suara('38000000-0000-4000-8000-000000000e01', pg_temp.calon(11, 20), pg_temp.calon(11, 15)) $$,
  'PM003', 'Anda sudah memberikan suara.', 'A: a second vote is refused'
);
select pg_temp.sebagai(null);

select is(
  (select array_agg(format('%s/%s/%s', metode, coalesce(dibantu_oleh::text, '-'), coalesce(nomor_formulir, '-')))
   from public.pemilihan_partisipasi where pemilihan_id = '38000000-0000-4000-8000-000000000e01'),
  array['mandiri/-/-'], 'one partisipasi row for A, mandiri, no panitia, no form number'
);
select is(
  (select jemaat_id from public.pemilihan_partisipasi where pemilihan_id = '38000000-0000-4000-8000-000000000e01'),
  '38000000-0000-4000-8000-0000000000a1'::uuid, 'the partisipasi row is A''s'
);
select is(
  (select array_agg(format('%s:%s', kontes, n) order by kontes)
   from (select kontes, count(*) as n from public.pemilihan_suara where pemilihan_id = '38000000-0000-4000-8000-000000000e01' group by kontes) as x),
  array['penatua:10', 'ppj:5'], 'exactly 15 suara rows: 10 Penatua, 5 PPJ, the second vote added none'
);

-- B: the limits, then the upper bounds.
select pg_temp.sebagai('38000000-0000-4000-8000-000000000002');
select throws_ok(
  $$ select * from portal.berikan_suara('38000000-0000-4000-8000-000000000e01', pg_temp.calon(1, 9), pg_temp.calon(1, 5)) $$,
  'PM004', 'Pilih minimal 10 calon Penatua (Majelis Jemaat). Saat ini 9 dipilih.', '9 Penatua are too few'
);
select throws_ok(
  $$ select * from portal.berikan_suara('38000000-0000-4000-8000-000000000e01', pg_temp.calon(1, 31), pg_temp.calon(1, 5)) $$,
  'PM004', 'Pilih paling banyak 30 calon Penatua (Majelis Jemaat). Saat ini 31 dipilih.', '31 Penatua are too many'
);
select throws_ok(
  $$ select * from portal.berikan_suara('38000000-0000-4000-8000-000000000e01', pg_temp.calon(1, 10), pg_temp.calon(1, 4)) $$,
  'PM004', 'Pilih minimal 5 calon PPJ (Pengawas Perbendaharaan Jemaat). Saat ini 4 dipilih.', '4 PPJ are too few'
);
select throws_ok(
  $$ select * from portal.berikan_suara('38000000-0000-4000-8000-000000000e01', pg_temp.calon(1, 10), pg_temp.calon(1, 16)) $$,
  'PM004', 'Pilih paling banyak 15 calon PPJ (Pengawas Perbendaharaan Jemaat). Saat ini 16 dipilih.', '16 PPJ are too many'
);
select throws_ok(
  $$ select * from portal.berikan_suara('38000000-0000-4000-8000-000000000e01', null, null) $$,
  'PM004', 'Pilih minimal 10 calon Penatua (Majelis Jemaat). Saat ini 0 dipilih.', 'an empty ballot is refused'
);
select pg_temp.sebagai(null);
select is(
  (select count(*)::int from public.pemilihan_partisipasi where jemaat_id = '38000000-0000-4000-8000-0000000000b1'),
  0, 'B''s refused ballots wrote no partisipasi row'
);
select is(
  (select count(*)::int from public.pemilihan_suara where pemilihan_id = '38000000-0000-4000-8000-000000000e01'),
  15, '... and no suara row'
);
select pg_temp.sebagai('38000000-0000-4000-8000-000000000002');
select lives_ok(
  $$ select * from portal.berikan_suara('38000000-0000-4000-8000-000000000e01', pg_temp.calon(1, 30), pg_temp.calon(11, 25)) $$,
  'B: 30 Penatua + 15 PPJ (the upper bounds) is accepted'
);
select pg_temp.sebagai(null);
select is(
  (select count(*)::int from public.pemilihan_suara where pemilihan_id = '38000000-0000-4000-8000-000000000e01'),
  60, 'B''s ballot added exactly 45 suara rows'
);

-- D: choices that aren't candidates of E1.
select pg_temp.sebagai('38000000-0000-4000-8000-000000000004');
select throws_ok(
  $$ select * from portal.berikan_suara('38000000-0000-4000-8000-000000000e01',
       pg_temp.calon(1, 9) || '38000000-0000-4000-8000-0000000000a1'::uuid, pg_temp.calon(1, 5)) $$,
  'PM005', 'Ada pilihan Penatua (Majelis Jemaat) yang bukan calon pada pemilihan ini.',
  'a peserta without dapat_dipilih is not a candidate'
);
select throws_ok(
  $$ select * from portal.berikan_suara('38000000-0000-4000-8000-000000000e01',
       pg_temp.calon(1, 10), pg_temp.calon(1, 4) || '38000000-0000-4000-8000-0000000000f5'::uuid) $$,
  'PM005', 'Ada pilihan PPJ (Pengawas Perbendaharaan Jemaat) yang bukan calon pada pemilihan ini.',
  'a candidate of another election is refused'
);
select throws_ok(
  $$ select * from portal.berikan_suara('38000000-0000-4000-8000-000000000e01',
       pg_temp.calon(1, 10), pg_temp.calon(1, 4) || gen_random_uuid()) $$,
  'PM005', 'Ada pilihan PPJ (Pengawas Perbendaharaan Jemaat) yang bukan calon pada pemilihan ini.',
  'an unknown id is refused'
);
select throws_ok(
  $$ select * from portal.berikan_suara('38000000-0000-4000-8000-000000000e01',
       pg_temp.calon(1, 9) || null::uuid, pg_temp.calon(1, 5)) $$,
  'PM005', 'Ada pilihan Penatua (Majelis Jemaat) yang bukan calon pada pemilihan ini.', 'a null choice is refused'
);
select throws_ok(
  $$ select * from portal.berikan_suara('38000000-0000-4000-8000-000000000e01',
       pg_temp.calon(1, 10) || pg_temp.k(1), pg_temp.calon(1, 5)) $$,
  'PM006', 'Ada calon Penatua (Majelis Jemaat) yang dipilih lebih dari sekali.', 'a duplicate within a contest is refused'
);
select throws_ok(
  $$ select * from portal.berikan_suara('38000000-0000-4000-8000-000000000e01',
       array[pg_temp.calon(1, 5), pg_temp.calon(6, 10)], pg_temp.calon(1, 5)) $$,
  'PM005', 'Ada pilihan Penatua (Majelis Jemaat) yang bukan calon pada pemilihan ini.', 'a two-dimensional array is refused'
);
select is(
  (select count(*)::int from portal.pemilihan_aktif_saya() where sudah_memilih),
  0, 'D''s refused ballots left D not voted'
);
select pg_temp.sebagai(null);
select is(
  (select count(*)::int from public.pemilihan_suara where pemilihan_id = '38000000-0000-4000-8000-000000000e01'),
  60, '... and no suara row was added'
);

-- Who may vote, and when.
select pg_temp.sebagai('38000000-0000-4000-8000-000000000003');
select throws_ok(
  $$ select * from portal.berikan_suara('38000000-0000-4000-8000-000000000e01', pg_temp.calon(1, 10), pg_temp.calon(1, 5)) $$,
  'PM002', 'Anda tidak terdaftar sebagai pemilih pada pemilihan ini.', 'a peserta without dapat_memilih can''t vote'
);
select pg_temp.sebagai('38000000-0000-4000-8000-000000000005');
select throws_ok(
  $$ select * from portal.berikan_suara('38000000-0000-4000-8000-000000000e01', pg_temp.calon(1, 10), pg_temp.calon(1, 5)) $$,
  'PM002', 'Anda tidak terdaftar sebagai pemilih pada pemilihan ini.', 'a jemaat outside the peserta list can''t vote'
);
select pg_temp.sebagai('38000000-0000-4000-8000-00000000000a');
select throws_ok(
  $$ select * from portal.berikan_suara('38000000-0000-4000-8000-000000000e03', pg_temp.calon(1, 10), pg_temp.calon(1, 5)) $$,
  'PM001', 'Pemungutan suara belum dibuka.', 'before dibuka_pada: refused'
);
select throws_ok(
  $$ select * from portal.berikan_suara('38000000-0000-4000-8000-000000000e04', pg_temp.calon(1, 10), pg_temp.calon(1, 5)) $$,
  'PM001', 'Pemungutan suara sudah ditutup.', 'at ditutup_pada (the end is exclusive): refused'
);
select throws_ok(
  $$ select * from portal.berikan_suara('38000000-0000-4000-8000-000000000e05', pg_temp.calon(1, 10), pg_temp.calon(1, 5)) $$,
  'PM001', 'Pemungutan suara sudah ditutup.', 'status ditutup: refused'
);
select pg_temp.sebagai('38000000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select * from portal.berikan_suara('38000000-0000-4000-8000-000000000e02', pg_temp.calon(1, 10), pg_temp.calon(1, 5)) $$,
  'PM001', 'Pemungutan suara belum dibuka.', 'status draft: refused'
);
select throws_ok(
  $$ select * from portal.berikan_suara(gen_random_uuid(), pg_temp.calon(1, 10), pg_temp.calon(1, 5)) $$,
  'P0002', 'Pemilihan tidak ditemukan.', 'an unknown election: not found'
);
select pg_temp.sebagai('38000000-0000-4000-8000-000000000007');
select throws_ok(
  $$ select * from portal.berikan_suara('38000000-0000-4000-8000-000000000e01', pg_temp.calon(1, 10), pg_temp.calon(1, 5)) $$,
  'PT403', 'Akun ini belum terhubung ke data jemaat.', 'a staff account without a jemaat can''t vote in the portal'
);
select pg_temp.sebagai(null);
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok(
  $$ select * from portal.berikan_suara('38000000-0000-4000-8000-000000000e01', '{}', '{}') $$,
  '42501', null::text, 'anon can''t call portal.berikan_suara'
);
select throws_ok(
  $$ select * from public.hasil_partisipasi('38000000-0000-4000-8000-000000000e01') $$,
  '42501', null::text, 'anon can''t call hasil_partisipasi'
);
reset role;
select pg_temp.sebagai(null);

-- ---------------------------------------------------------------------------
-- No direct access to suara or partisipasi, for anyone
-- ---------------------------------------------------------------------------
select pg_temp.sebagai('38000000-0000-4000-8000-000000000007');
select throws_ok($$ select count(*) from public.pemilihan_suara $$, '42501', null::text, 'super_admin can''t select pemilihan_suara');
select throws_ok($$ select count(*) from public.pemilihan_partisipasi $$, '42501', null::text, 'super_admin can''t select pemilihan_partisipasi');
select throws_ok(
  $$ insert into public.pemilihan_suara (pemilihan_id, kontes, kandidat_jemaat_id)
     values ('38000000-0000-4000-8000-000000000e01', 'penatua', '38000000-0000-4000-8000-000000000101') $$,
  '42501', null::text, 'super_admin can''t insert a suara row'
);
select throws_ok(
  $$ insert into public.pemilihan_partisipasi (pemilihan_id, jemaat_id, metode)
     values ('38000000-0000-4000-8000-000000000e01', '38000000-0000-4000-8000-0000000000d1', 'mandiri') $$,
  '42501', null::text, 'super_admin can''t insert a partisipasi row'
);
select pg_temp.sebagai('38000000-0000-4000-8000-000000000006');
select throws_ok($$ select count(*) from public.pemilihan_suara $$, '42501', null::text, 'panitia can''t select pemilihan_suara');
select throws_ok($$ select count(*) from public.pemilihan_partisipasi $$, '42501', null::text, 'panitia can''t select pemilihan_partisipasi');
select pg_temp.sebagai('38000000-0000-4000-8000-000000000001');
select throws_ok($$ select count(*) from public.pemilihan_suara $$, '42501', null::text, 'a voter can''t select pemilihan_suara');
select pg_temp.sebagai(null);
set local role service_role;
select throws_ok($$ select count(*) from public.pemilihan_suara $$, '42501', null::text, 'service_role can''t select pemilihan_suara');
select throws_ok($$ select count(*) from public.pemilihan_partisipasi $$, '42501', null::text, 'service_role can''t select pemilihan_partisipasi');
reset role;

-- Votes are final, even for the table owner.
select throws_ok(
  $$ update public.pemilihan_suara set kandidat_jemaat_id = '38000000-0000-4000-8000-000000000132' $$,
  'PM010', 'Data pemungutan suara bersifat final: tidak bisa diubah atau dihapus.', 'a suara row can''t be updated'
);
select throws_ok(
  $$ delete from public.pemilihan_suara $$,
  'PM010', 'Data pemungutan suara bersifat final: tidak bisa diubah atau dihapus.', 'a suara row can''t be deleted'
);
select throws_ok($$ truncate public.pemilihan_suara $$, 'PM010', null::text, 'pemilihan_suara can''t be truncated');
select throws_ok($$ update public.pemilihan_partisipasi set waktu = now() - interval '1 day' $$, 'PM010', null::text, 'a partisipasi row can''t be updated');
select throws_ok($$ delete from public.pemilihan_partisipasi $$, 'PM010', null::text, 'a partisipasi row can''t be deleted');
select throws_ok(
  $$ insert into public.pemilihan_partisipasi (pemilihan_id, jemaat_id, metode, nomor_formulir)
     values ('38000000-0000-4000-8000-000000000e01', '38000000-0000-4000-8000-0000000000f4', 'mandiri', 'F-1') $$,
  '23514', null::text, 'partisipasi: mandiri never carries a form number'
);
select throws_ok(
  $$ insert into public.pemilihan_partisipasi (pemilihan_id, jemaat_id, metode, nomor_formulir)
     values ('38000000-0000-4000-8000-000000000e01', '38000000-0000-4000-8000-0000000000f4', 'dibantu', 'F-1') $$,
  '23514', null::text, 'partisipasi: dibantu always names the panitia'
);

-- ---------------------------------------------------------------------------
-- Portal: the caller's elections and the candidates
-- ---------------------------------------------------------------------------
select pg_temp.sebagai('38000000-0000-4000-8000-000000000001');
select is(
  (select array_agg(format('%s|%s|%s|%s|%s', nama, dapat_memilih, sudah_memilih, metode, hasil_tersedia)) from portal.pemilihan_aktif_saya()),
  array['Pemilihan Uji Utama|t|t|mandiri|f'],
  'A sees E1 (voted, mandiri, no results yet), not the draft E2'
);
select is(
  (select waktu_memilih from portal.pemilihan_aktif_saya()), now(), 'A sees when she voted'
);
select is(
  (select count(*)::int from portal.kandidat('38000000-0000-4000-8000-000000000e01')),
  32, 'kandidat lists all 32 candidates of E1'
);
select is(
  (select array_agg(nama_tampilan) from (select nama_tampilan from portal.kandidat('38000000-0000-4000-8000-000000000e01') limit 3) as x),
  array['Ibu Anita Uji', 'Bpk. Budi Uji', 'Sdri. Calon Uji 03'],
  'candidates are sorted by name, ignoring the honorific'
);
select throws_ok(
  $$ select * from portal.kandidat('38000000-0000-4000-8000-000000000e02') $$,
  'PM001', 'Pemungutan suara belum dibuka.', 'kandidat of a draft election: refused'
);
select pg_temp.sebagai('38000000-0000-4000-8000-000000000003');
select throws_ok(
  $$ select * from portal.kandidat('38000000-0000-4000-8000-000000000e01') $$,
  'PM002', 'Anda tidak terdaftar sebagai pemilih pada pemilihan ini.', 'kandidat for a peserta who may not vote: refused'
);
select is(
  (select array_agg(format('%s|%s', dapat_memilih, sudah_memilih)) from portal.pemilihan_aktif_saya()),
  array['f|f'], 'C sees E1 as a peserta who may not vote'
);
select pg_temp.sebagai('38000000-0000-4000-8000-00000000000a');
select throws_ok(
  $$ select * from portal.kandidat('38000000-0000-4000-8000-000000000e05') $$,
  'PM001', 'Pemungutan suara sudah ditutup.', 'kandidat of a closed election: refused'
);
select pg_temp.sebagai('38000000-0000-4000-8000-000000000005');
select is((select count(*)::int from portal.pemilihan_aktif_saya()), 0, 'N (no peserta row) sees no election');
select pg_temp.sebagai('38000000-0000-4000-8000-000000000004');
select is(
  (select array_agg(format('%s|%s|%s', sudah_memilih, coalesce(waktu_memilih::text, '-'), coalesce(metode, '-'))) from portal.pemilihan_aktif_saya()),
  array['f|-|-'], 'D, not voted yet: no time, no method'
);
select pg_temp.sebagai(null);

-- ---------------------------------------------------------------------------
-- Assisted voting (berikan_suara_dibantu)
-- ---------------------------------------------------------------------------
select pg_temp.sebagai('38000000-0000-4000-8000-000000000008');
select throws_ok(
  $$ select * from public.berikan_suara_dibantu('38000000-0000-4000-8000-000000000e01', '38000000-0000-4000-8000-0000000000f3',
       'F-001', pg_temp.calon(1, 12), pg_temp.calon(1, 6)) $$,
  '42501', 'Kamu tidak punya akses untuk tindakan ini.', 'admin (no pemilihan_bantu:create) can''t assist'
);
select pg_temp.sebagai('38000000-0000-4000-8000-000000000006');
select is(
  (select format('%s|%s', waktu = now(), nama_pemilih)
   from public.berikan_suara_dibantu('38000000-0000-4000-8000-000000000e01', '38000000-0000-4000-8000-0000000000f3',
     ' F-001 ', pg_temp.calon(1, 12), pg_temp.calon(1, 6))),
  't|Ibu Vina', 'panitia records V1''s paper ballot (V1 has no portal account); returns the time and her name'
);
select throws_ok(
  $$ select * from public.berikan_suara_dibantu('38000000-0000-4000-8000-000000000e01', '38000000-0000-4000-8000-0000000000f4',
       'f-001', pg_temp.calon(1, 10), pg_temp.calon(1, 5)) $$,
  'PM007', 'Nomor formulir "f-001" sudah dipakai pada pemilihan ini.', 'a form number is used once per election, case-insensitively'
);
select throws_ok(
  $$ select * from public.berikan_suara_dibantu('38000000-0000-4000-8000-000000000e01', '38000000-0000-4000-8000-0000000000f2',
       'F-002', pg_temp.calon(1, 10), pg_temp.calon(1, 5)) $$,
  'PM008', 'Panitia tidak bisa membantu memberikan suara untuk dirinya sendiri. Silakan memilih lewat Portal Jemaat.',
  'a panitia can''t assist their own jemaat record'
);
select throws_ok(
  $$ select * from public.berikan_suara_dibantu('38000000-0000-4000-8000-000000000e01', '38000000-0000-4000-8000-0000000000f4',
       '   ', pg_temp.calon(1, 10), pg_temp.calon(1, 5)) $$,
  'PM009', 'Nomor formulir wajib diisi.', 'a form number is required'
);
select throws_ok(
  $$ select * from public.berikan_suara_dibantu('38000000-0000-4000-8000-000000000e01', '38000000-0000-4000-8000-0000000000f4',
       repeat('9', 51), pg_temp.calon(1, 10), pg_temp.calon(1, 5)) $$,
  'PM009', 'Nomor formulir maksimal 50 karakter.', 'a form number is at most 50 characters'
);
select throws_ok(
  $$ select * from public.berikan_suara_dibantu('38000000-0000-4000-8000-000000000e01', '38000000-0000-4000-8000-0000000000a1',
       'F-009', pg_temp.calon(1, 10), pg_temp.calon(1, 5)) $$,
  'PM003', 'Pemilih ini sudah memberikan suara.', 'a voter who already voted can''t be assisted'
);
select throws_ok(
  $$ select * from public.berikan_suara_dibantu('38000000-0000-4000-8000-000000000e01', '38000000-0000-4000-8000-0000000000c1',
       'F-010', pg_temp.calon(1, 10), pg_temp.calon(1, 5)) $$,
  'PM002', 'Jemaat ini tidak terdaftar sebagai pemilih pada pemilihan ini.', 'a peserta who may not vote can''t be assisted'
);
select throws_ok(
  $$ select * from public.berikan_suara_dibantu('38000000-0000-4000-8000-000000000e01', '38000000-0000-4000-8000-0000000000f4',
       'F-011', pg_temp.calon(1, 9), pg_temp.calon(1, 5)) $$,
  'PM004', 'Pilih minimal 10 calon Penatua (Majelis Jemaat). Saat ini 9 dipilih.', 'an assisted ballot follows the same limits'
);
select throws_ok(
  $$ select * from public.berikan_suara_dibantu('38000000-0000-4000-8000-000000000e05', '38000000-0000-4000-8000-0000000000e1',
       'F-012', pg_temp.calon(1, 10), pg_temp.calon(1, 5)) $$,
  'PM001', 'Pemungutan suara sudah ditutup.', 'no assisted vote in a closed election'
);
-- S (super_admin) assists D, who has a portal account.
select pg_temp.sebagai('38000000-0000-4000-8000-000000000007');
select lives_ok(
  $$ select * from public.berikan_suara_dibantu('38000000-0000-4000-8000-000000000e01', '38000000-0000-4000-8000-0000000000d1',
       'F-002', pg_temp.calon(1, 10), pg_temp.calon(1, 5)) $$,
  'super_admin records D''s paper ballot'
);
select pg_temp.sebagai('38000000-0000-4000-8000-000000000004');
select is(
  (select array_agg(format('%s|%s', sudah_memilih, metode)) from portal.pemilihan_aktif_saya()),
  array['t|dibantu'], 'D''s portal shows an assisted vote'
);
select throws_ok(
  $$ select * from portal.berikan_suara('38000000-0000-4000-8000-000000000e01', pg_temp.calon(1, 10), pg_temp.calon(1, 5)) $$,
  'PM003', 'Anda sudah memberikan suara.', 'D can''t vote again in the portal'
);
select pg_temp.sebagai(null);
select is(
  (select array_agg(format('%s|%s|%s|%s', jemaat_id, metode, dibantu_oleh, nomor_formulir) order by nomor_formulir)
   from public.pemilihan_partisipasi where metode = 'dibantu'),
  array[
    '38000000-0000-4000-8000-0000000000f3|dibantu|38000000-0000-4000-8000-000000000006|F-001',
    '38000000-0000-4000-8000-0000000000d1|dibantu|38000000-0000-4000-8000-000000000007|F-002'
  ],
  'assisted partisipasi rows carry the panitia and the trimmed form number'
);
select is(
  (select count(*)::int from public.pemilihan_suara where pemilihan_id = '38000000-0000-4000-8000-000000000e01'),
  93, 'the two assisted ballots added exactly 18 + 15 suara rows, no more'
);

-- ---------------------------------------------------------------------------
-- Results
-- ---------------------------------------------------------------------------
-- Ballots in E1: A (K01–10 | K01–05), B (K01–30 | K11–25), V1 (K01–12 |
-- K01–06), D (K01–10 | K01–05).
select pg_temp.sebagai('38000000-0000-4000-8000-000000000006');
select is(
  (select format('%s|%s|%s|%s|%s', total_pemilih, sudah_memilih, persen, mandiri, dibantu)
   from public.hasil_partisipasi('38000000-0000-4000-8000-000000000e01')),
  '6|4|66.7|2|2', 'turnout: 6 voters (account or not), 4 voted (66.7%), 2 mandiri, 2 dibantu'
);
select is(
  (select dibantu_per_panitia from public.hasil_partisipasi('38000000-0000-4000-8000-000000000e01')),
  '[{"nama": "Panitia Uji Pertama", "jumlah": 1, "user_id": "38000000-0000-4000-8000-000000000006"},
    {"nama": "Super Admin Uji", "jumlah": 1, "user_id": "38000000-0000-4000-8000-000000000007"}]'::jsonb,
  'assisted votes per panitia'
);
select is(
  (select format('%s|%s|%s', total_pemilih, sudah_memilih, persen) from public.hasil_partisipasi('38000000-0000-4000-8000-000000000e02')),
  '1|0|0.0', 'turnout of a draft: nothing voted'
);
-- The panitia's tally: live while dibuka, though tampilkan_hasil_saat_berjalan is off.
select is(
  (select count(*)::int from public.hasil_suara('38000000-0000-4000-8000-000000000e01')),
  64, 'hasil_suara while dibuka (switch off): every candidate in both contests'
);
select is(
  (select array_agg(format('%s:%s=%s#%s', h.kontes, h.nama_tampilan, h.jumlah_suara, h.peringkat) order by h.n)
   from public.hasil_suara('38000000-0000-4000-8000-000000000e01')
     with ordinality as h (kontes, kontes_nama, jemaat_id, nama_tampilan, jumlah_suara, peringkat, n)
   where h.jemaat_id in (pg_temp.k(1), pg_temp.k(11), pg_temp.k(13), pg_temp.k(31), pg_temp.k(6), pg_temp.k(26))),
  array[
    'penatua:Ibu Anita Uji=4#1', 'penatua:Sdr. Calon Uji 06=4#1', 'penatua:Sdri. Calon Uji 11=2#11',
    'penatua:Sdri. Calon Uji 13=1#13', 'penatua:Sdr. Calon Uji 26=1#13', 'penatua:Sdri. Calon Uji 31=0#31',
    'ppj:Ibu Anita Uji=3#1', 'ppj:Sdr. Calon Uji 06=1#6', 'ppj:Sdri. Calon Uji 11=1#6', 'ppj:Sdri. Calon Uji 13=1#6',
    'ppj:Sdr. Calon Uji 26=0#22', 'ppj:Sdri. Calon Uji 31=0#22'
  ],
  'tallies per contest, most votes first; ties share a rank (Seri) and are sorted by name'
);
select is(
  (select array_agg(format('%s=%s', kontes, n) order by kontes)
   from (select kontes, sum(jumlah_suara)::int as n from public.hasil_suara('38000000-0000-4000-8000-000000000e01') group by kontes) as x),
  array['penatua=62', 'ppj=31'], 'the tallies add up to the 93 suara rows'
);
select pg_temp.sebagai('38000000-0000-4000-8000-000000000008');
select throws_ok(
  $$ select * from public.hasil_suara('38000000-0000-4000-8000-000000000e01') $$,
  '42501', 'Kamu tidak punya akses untuk tindakan ini.', 'hasil_suara without pemilihan_hasil:read: refused'
);
select throws_ok(
  $$ select * from public.hasil_partisipasi('38000000-0000-4000-8000-000000000e01') $$,
  '42501', 'Kamu tidak punya akses untuk tindakan ini.', 'hasil_partisipasi without pemilihan:read: refused'
);
select pg_temp.sebagai('38000000-0000-4000-8000-000000000009');
select throws_ok(
  $$ select * from public.hasil_suara('38000000-0000-4000-8000-000000000e01') $$,
  '42501', 'Kamu tidak punya akses untuk tindakan ini.', 'viewer can''t read hasil_suara'
);
select pg_temp.sebagai('38000000-0000-4000-8000-000000000006');
select throws_ok(
  $$ select * from public.hasil_suara(gen_random_uuid()) $$, 'P0002', 'Pemilihan tidak ditemukan.', 'hasil_suara of an unknown election'
);

-- The Portal Jemaat's view.
select pg_temp.sebagai('38000000-0000-4000-8000-000000000001');
select is(
  (select count(*)::int from portal.hasil_pemilihan('38000000-0000-4000-8000-000000000e01')),
  0, 'portal: dibuka with the switch off: no rows'
);
select pg_temp.sebagai(null);
select lives_ok(
  $$ update public.pemilihan set tampilkan_hasil_saat_berjalan = true where id = '38000000-0000-4000-8000-000000000e01' $$,
  'the switch may be turned on while dibuka'
);
select pg_temp.sebagai('38000000-0000-4000-8000-000000000001');
select is(
  (select count(*)::int from portal.hasil_pemilihan('38000000-0000-4000-8000-000000000e01')),
  64, 'portal: dibuka with the switch on: the full tally'
);
select is(
  (select format('%s|%s|%s', nama_tampilan, jumlah_suara, peringkat) from portal.hasil_pemilihan('38000000-0000-4000-8000-000000000e01') limit 1),
  'Ibu Anita Uji|4|1', '... with the same numbers as hasil_suara'
);
select is(
  (select hasil_tersedia from portal.pemilihan_aktif_saya()), true, 'pemilihan_aktif_saya says the results are available'
);
select pg_temp.sebagai('38000000-0000-4000-8000-000000000005');
select is(
  (select count(*)::int from portal.hasil_pemilihan('38000000-0000-4000-8000-000000000e01')),
  64, 'any jemaat account may read the shown results, not only peserta'
);
select pg_temp.sebagai('38000000-0000-4000-8000-000000000007');
select throws_ok(
  $$ select * from portal.hasil_pemilihan('38000000-0000-4000-8000-000000000e01') $$,
  'PT403', 'Akun ini belum terhubung ke data jemaat.', 'portal.hasil_pemilihan needs a jemaat account'
);
select pg_temp.sebagai(null);
update public.pemilihan set status = 'ditutup' where id = '38000000-0000-4000-8000-000000000e01';
select pg_temp.sebagai('38000000-0000-4000-8000-000000000001');
select is(
  (select count(*)::int from portal.hasil_pemilihan('38000000-0000-4000-8000-000000000e01')),
  64, 'portal: ditutup with the switch on: the full tally'
);
select pg_temp.sebagai(null);
update public.pemilihan set tampilkan_hasil_saat_berjalan = false where id = '38000000-0000-4000-8000-000000000e01';
select pg_temp.sebagai('38000000-0000-4000-8000-000000000001');
select is(
  (select count(*)::int from portal.hasil_pemilihan('38000000-0000-4000-8000-000000000e01')),
  0, 'portal: ditutup with the switch off: no rows'
);
select pg_temp.sebagai('38000000-0000-4000-8000-000000000006');
select is(
  (select array_agg(format('%s=%s', kontes, n) order by kontes)
   from (select kontes, sum(jumlah_suara)::int as n from public.hasil_suara('38000000-0000-4000-8000-000000000e01') group by kontes) as x),
  array['penatua=62', 'ppj=31'], 'hasil_suara after ditutup: complete'
);
select pg_temp.sebagai(null);
update public.pemilihan set status = 'diumumkan' where id = '38000000-0000-4000-8000-000000000e01';
select pg_temp.sebagai('38000000-0000-4000-8000-000000000001');
select is(
  (select count(*)::int from portal.hasil_pemilihan('38000000-0000-4000-8000-000000000e01')),
  64, 'portal: diumumkan: the full tally, whatever the switch says'
);
select is(
  (select array_agg(format('%s|%s', status, hasil_tersedia)) from portal.pemilihan_aktif_saya()),
  array['diumumkan|t'], 'pemilihan_aktif_saya keeps announced elections, with their results'
);
select is(
  (select count(*)::int from portal.hasil_pemilihan('38000000-0000-4000-8000-000000000e02')),
  0, 'portal: a draft: no rows'
);
select throws_ok(
  $$ select * from portal.hasil_pemilihan(gen_random_uuid()) $$, 'P0002', 'Pemilihan tidak ditemukan.', 'portal: an unknown election'
);
select pg_temp.sebagai(null);

-- ---------------------------------------------------------------------------
-- Guards: frozen after draft, status order, opening requirements
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.pemilihan_peserta (pemilihan_id, jemaat_id, nama_tampilan, dapat_memilih)
     values ('38000000-0000-4000-8000-000000000e03', '38000000-0000-4000-8000-0000000000f1', 'Ibu Nora', true) $$,
  'PM010', 'Daftar peserta tidak bisa diubah setelah pemilihan dibuka.', 'no peserta can be added once dibuka'
);
select throws_ok(
  $$ update public.pemilihan_peserta set dapat_dipilih = true
     where pemilihan_id = '38000000-0000-4000-8000-000000000e03' and jemaat_id = '38000000-0000-4000-8000-0000000000e1' $$,
  'PM010', 'Daftar peserta tidak bisa diubah setelah pemilihan dibuka.', 'no peserta can be changed once dibuka'
);
select throws_ok(
  $$ delete from public.pemilihan_peserta where pemilihan_id = '38000000-0000-4000-8000-000000000e03' $$,
  'PM010', 'Daftar peserta tidak bisa diubah setelah pemilihan dibuka.', 'no peserta can be removed once dibuka'
);
select throws_ok(
  $$ update public.pemilihan_peserta set nama_tampilan = 'Bpk. Lain'
     where pemilihan_id = '38000000-0000-4000-8000-000000000e01' and jemaat_id = pg_temp.k(1) $$,
  'PM010', 'Daftar peserta tidak bisa diubah setelah pemilihan dibuka.', 'nor after diumumkan'
);
select throws_ok(
  $$ update public.pemilihan set nama = 'Nama Lain' where id = '38000000-0000-4000-8000-000000000e03' $$,
  'PM010', 'Pemilihan yang sudah dibuka tidak bisa diubah. Yang masih bisa diatur hanya tampilkan hasil saat berjalan.',
  'an open election''s name is frozen'
);
select throws_ok(
  $$ update public.pemilihan set ditutup_pada = now() + interval '5 hours' where id = '38000000-0000-4000-8000-000000000e03' $$,
  'PM010', 'Pemilihan yang sudah dibuka tidak bisa diubah. Yang masih bisa diatur hanya tampilkan hasil saat berjalan.',
  'an open election''s schedule is frozen'
);
select throws_ok(
  $$ update public.pemilihan set waktu_dibuka = now() - interval '1 day' where id = '38000000-0000-4000-8000-000000000e03' $$,
  'PM010', 'Waktu dan pencatat perubahan status diisi otomatis dan tidak bisa diubah.', 'the status stamps can''t be written by hand'
);
select throws_ok(
  $$ update public.pemilihan set status = 'draft' where id = '38000000-0000-4000-8000-000000000e03' $$,
  'PM011', 'Status pemilihan tidak bisa diubah dari "dibuka" ke "draft".', 'no way back to draft'
);
select throws_ok(
  $$ update public.pemilihan set status = 'diumumkan' where id = '38000000-0000-4000-8000-000000000e03' $$,
  'PM011', 'Status pemilihan tidak bisa diubah dari "dibuka" ke "diumumkan".', 'no skipping ditutup'
);
select throws_ok(
  $$ update public.pemilihan set status = 'ditutup' where id = '38000000-0000-4000-8000-000000000e02' $$,
  'PM011', 'Status pemilihan tidak bisa diubah dari "draft" ke "ditutup".', 'a draft can''t be closed'
);
select throws_ok(
  $$ insert into public.pemilihan (nama, status) values ('Langsung Dibuka', 'dibuka') $$,
  'PM011', 'Pemilihan baru harus berstatus draft.', 'a new election starts as draft'
);
select throws_ok(
  $$ update public.pemilihan set status = 'dibuka' where id = '38000000-0000-4000-8000-000000000e02' $$,
  'PM011', 'Atur jadwal dibuka dan ditutup sebelum membuka pemilihan.', 'opening needs a schedule'
);
select throws_ok(
  $$ update public.pemilihan set dibuka_pada = now(), ditutup_pada = now() where id = '38000000-0000-4000-8000-000000000e02' $$,
  '23514', null::text, 'dibuka_pada must come before ditutup_pada'
);
select throws_ok(
  $$ update public.pemilihan set status = 'dibuka', dibuka_pada = now() - interval '2 hours', ditutup_pada = now() - interval '1 hour'
     where id = '38000000-0000-4000-8000-000000000e02' $$,
  'PM011', 'Jadwal ditutup sudah lewat. Ubah jadwalnya sebelum membuka pemilihan.', 'opening needs a window that hasn''t ended'
);
select throws_ok(
  $$ update public.pemilihan set status = 'dibuka', dibuka_pada = now(), ditutup_pada = now() + interval '1 hour'
     where id = '38000000-0000-4000-8000-000000000e02' $$,
  'PM011', 'Calon yang dapat dipilih baru 1 orang, padahal Penatua (Majelis Jemaat) minimal 10 pilihan.',
  'opening needs at least as many candidates as each contest''s minimum'
);
-- The panitia completes E2 in draft (allowed) and opens it: the stamp is theirs.
select pg_temp.sebagai('38000000-0000-4000-8000-000000000006');
select lives_ok(
  $$ insert into public.pemilihan_peserta (pemilihan_id, jemaat_id, nama_tampilan, dapat_dipilih)
     select '38000000-0000-4000-8000-000000000e02', pg_temp.k(i), 'Calon ' || i, true from generate_series(1, 9) as i $$,
  'peserta can be added while draft'
);
select lives_ok(
  $$ update public.pemilihan set status = 'dibuka', dibuka_pada = now(), ditutup_pada = now() + interval '1 hour'
     where id = '38000000-0000-4000-8000-000000000e02' $$,
  'the panitia opens E2 once it has 10 candidates and a voter'
);
select pg_temp.sebagai(null);
select is(
  (select format('%s|%s|%s', status, dibuka_oleh, waktu_dibuka = now()) from public.pemilihan where id = '38000000-0000-4000-8000-000000000e02'),
  'dibuka|38000000-0000-4000-8000-000000000006|t', 'opening records who and when'
);
select throws_ok(
  $$ delete from public.pemilihan where id = '38000000-0000-4000-8000-000000000e02' $$,
  'PM010', 'Pemilihan yang sudah dibuka tidak bisa dihapus.', 'an election past draft can''t be deleted'
);
select throws_ok(
  $$ delete from public.jemaat where id = '38000000-0000-4000-8000-0000000000a1' $$,
  '23503', null::text, 'a jemaat on an election list can''t be deleted'
);
insert into public.pemilihan (id, nama) values ('38000000-0000-4000-8000-000000000e09', 'Pemilihan Uji Dihapus');
insert into public.pemilihan_peserta (pemilihan_id, jemaat_id, nama_tampilan, dapat_memilih)
values ('38000000-0000-4000-8000-000000000e09', '38000000-0000-4000-8000-0000000000f1', 'Ibu Nora', true);
select lives_ok(
  $$ delete from public.pemilihan where id = '38000000-0000-4000-8000-000000000e09' $$,
  'a draft election can be deleted, with its peserta'
);
select is(
  (select count(*)::int from public.pemilihan_peserta where pemilihan_id = '38000000-0000-4000-8000-000000000e09'),
  0, '... its peserta went with it'
);

-- RLS on the management tables.
select pg_temp.sebagai('38000000-0000-4000-8000-000000000009');
select is((select count(*)::int from public.pemilihan), 0, 'viewer (no pemilihan:read) sees no election');
select is((select count(*)::int from public.pemilihan_peserta), 0, 'viewer sees no peserta');
select is((select count(*)::int from public.pemilihan_kontes), 2, 'any signed-in account reads the contest config');
select pg_temp.sebagai('38000000-0000-4000-8000-000000000008');
select throws_ok(
  $$ insert into public.pemilihan (nama) values ('Oleh Admin') $$, '42501', null::text, 'admin (no pemilihan:create) can''t create one'
);
select pg_temp.sebagai('38000000-0000-4000-8000-000000000006');
select is(
  (select count(*)::int from public.pemilihan where id::text like '38000000-0000-4000-8000-000000000e0%'),
  5, 'the panitia sees the elections'
);
select throws_ok(
  $$ update public.pemilihan_kontes set max_pilih = 40 where kode = 'penatua' $$, '42501', null::text, 'nobody may change the contest config'
);
select pg_temp.sebagai(null);

-- ---------------------------------------------------------------------------
-- Activity log: the database writes none (the app logs, without choices)
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from public.activity_logs
   where user_id::text like '38000000-0000-4000-8000-00000000000%' or activity ~ 'Calon Uji|Anita|Budi Uji'),
  0, 'voting, assisting, and reading results wrote no activity_logs row'
);

select * from finish();
rollback;
