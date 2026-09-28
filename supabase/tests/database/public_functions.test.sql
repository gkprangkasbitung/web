-- The public schedule functions (brief §8, §12.1): published warta only,
-- the service week computed inside the function, and people by name only.
begin;
create extension if not exists pgtap with schema extensions;

select plan(21);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres). Tanggal kebaktian 2030-01-06 is a Sunday, so the
-- service week is 2030-01-06 .. 2030-01-12.
-- ---------------------------------------------------------------------------
insert into public.tempat (id, nama) values ('11000000-0000-4000-8000-0000000000c1', 'Uji Tempat');
insert into public.wilayah (id, nama) values ('11000000-0000-4000-8000-0000000000c2', 'Uji Wilayah');
insert into public.jemaat (id, nama, no_hp, alamat, tanggal_lahir) values
  ('11000000-0000-4000-8000-0000000000a1', 'Uji Pelayan Firman', '0811', 'Jl. Rahasia 1', '1970-01-01'),
  ('11000000-0000-4000-8000-0000000000a2', 'Uji Liturgos', '0812', 'Jl. Rahasia 2', '1971-01-01'),
  ('11000000-0000-4000-8000-0000000000a3', 'Uji Pemusik', '0813', 'Jl. Rahasia 3', '1972-01-01'),
  ('11000000-0000-4000-8000-0000000000a4', 'Uji PF', '0814', 'Jl. Rahasia 4', '1973-01-01');

insert into public.warta (slug, status, tanggal_kebaktian, judul_kebaktian) values
  ('uji-fn-published', 'published', '2030-01-06', 'Uji Published'),
  ('uji-fn-draft', 'draft', '2030-01-06', 'Uji Draft');

insert into public.peribadahan_items (
  id, category_id, tanggal, jam, sort_order, tempat_id, wilayah_id, dpa, tema,
  pelayan_firman_id, liturgos_id, pemusik_id, bahan_alkitab,
  kehadiran_laki_laki, kehadiran_perempuan, kehadiran_anak, catatan
)
select v.id::uuid, c.id, v.tanggal::date, v.jam::time, v.sort_order, v.tempat_id::uuid, v.wilayah_id::uuid,
  v.dpa, v.tema, v.pf::uuid, v.lit::uuid, v.pm::uuid, v.bahan, v.l, v.p, v.a, v.catatan
from (
  values
    -- the day before the service week: excluded
    ('11000000-0000-4000-8000-0000000000e1', 'umum', '2030-01-05', '07:00', 0, null, null, null, null,
      null, null, null, null, null::int, null::int, null::int, null),
    ('11000000-0000-4000-8000-0000000000e2', 'umum', '2030-01-06', '07:00', 0, '11000000-0000-4000-8000-0000000000c1', null, null, null,
      '11000000-0000-4000-8000-0000000000a1', '11000000-0000-4000-8000-0000000000a2', null, null, 10, 12, 5, 'Keterangan uji'),
    ('11000000-0000-4000-8000-0000000000e3', 'smka', '2030-01-06', '09:00', 1, null, null, null, 'Tema SMKA',
      null, '11000000-0000-4000-8000-0000000000a2', '11000000-0000-4000-8000-0000000000a3', 'Bahan uji', null, null, null, null),
    -- the last day of the service week: included
    ('11000000-0000-4000-8000-0000000000e4', 'krt', '2030-01-12', '19:00', 0, '11000000-0000-4000-8000-0000000000c1',
      '11000000-0000-4000-8000-0000000000c2', 'DPA uji', 'Tema KRT', '11000000-0000-4000-8000-0000000000a1', null, null, null,
      null, null, null, null),
    -- the next Sunday: excluded
    ('11000000-0000-4000-8000-0000000000e5', 'pa', '2030-01-13', '19:00', 0, null, null, null, null,
      null, null, null, null, null, null, null, null)
) as v (id, category_key, tanggal, jam, sort_order, tempat_id, wilayah_id, dpa, tema, pf, lit, pm, bahan, l, p, a, catatan)
join public.peribadahan_categories c on c.key = v.category_key;

insert into public.peribadahan_smka_kelompok (item_id, kelompok, pf_id, laki_laki, perempuan) values
  ('11000000-0000-4000-8000-0000000000e3', 'orang_tua', null, 0, null),
  ('11000000-0000-4000-8000-0000000000e3', 'balita', null, null, null),
  ('11000000-0000-4000-8000-0000000000e3', 'batita', '11000000-0000-4000-8000-0000000000a4', 1, 2);

-- This week in Asia/Jakarta, for public_jadwal_pekan_ini(): one row the day
-- before, one on Sunday, one on Saturday, one the next Sunday.
insert into public.peribadahan_items (id, category_id, tanggal)
select v.id::uuid, c.id, w.minggu + v.offset_days
from (select d - extract(dow from d)::int as minggu from (select (now() at time zone 'Asia/Jakarta')::date as d) as t) as w
cross join (
  values
    ('11000000-0000-4000-8000-0000000000f1', -1),
    ('11000000-0000-4000-8000-0000000000f2', 0),
    ('11000000-0000-4000-8000-0000000000f3', 6),
    ('11000000-0000-4000-8000-0000000000f4', 7)
) as v (id, offset_days)
join public.peribadahan_categories c on c.key = 'doa_pagi';

-- ---------------------------------------------------------------------------
-- Definitions: SECURITY DEFINER, empty search_path, callable by anon and
-- authenticated only, and no columns beyond what the public page shows.
-- ---------------------------------------------------------------------------
select ok(
  (select bool_and(p.prosecdef) from pg_proc p
   where p.oid in ('public.public_warta_schedule(text)'::regprocedure,
                   'public.public_warta_finance(text)'::regprocedure,
                   'public.public_jadwal_pekan_ini()'::regprocedure)),
  'the public functions are SECURITY DEFINER'
);

select ok(
  (select bool_and(p.proconfig = array['search_path=""']) from pg_proc p
   where p.oid in ('public.public_warta_schedule(text)'::regprocedure,
                   'public.public_warta_finance(text)'::regprocedure,
                   'public.public_jadwal_pekan_ini()'::regprocedure)),
  'the public functions run with an empty search_path'
);

select results_eq(
  format(
    $$ select array_agg(a.grantee::regrole::text order by a.grantee::regrole::text)
       from pg_proc p, aclexplode(p.proacl) a
       where p.oid = %L::regprocedure and a.privilege_type = 'EXECUTE' and a.grantee <> p.proowner $$,
    f
  ),
  $$ values (array['anon', 'authenticated']) $$,
  format('%s is executable by anon and authenticated only (not PUBLIC, not service_role)', f)
)
from unnest(array[
  'public.public_warta_schedule(text)',
  'public.public_warta_finance(text)',
  'public.public_jadwal_pekan_ini()'
]) as f;

select is(
  pg_get_function_result('public.public_warta_schedule(text)'::regprocedure),
  'TABLE(id uuid, tanggal date, jam time without time zone, sort_order integer, category_key text, '
  'category_name text, tempat_nama text, wilayah_nama text, dpa text, tema text, pelayan_firman_nama text, '
  'liturgos_nama text, pemusik_nama text, bahan_alkitab text, kehadiran_laki_laki integer, '
  'kehadiran_perempuan integer, kehadiran_anak integer, catatan text, smka_kelompok jsonb)',
  'public_warta_schedule returns names only, no other jemaat columns'
);

select is(
  pg_get_function_result('public.public_jadwal_pekan_ini()'::regprocedure),
  pg_get_function_result('public.public_warta_schedule(text)'::regprocedure),
  'public_jadwal_pekan_ini returns the same columns as public_warta_schedule'
);

select is(
  pg_get_function_result('public.public_warta_finance(text)'::regprocedure),
  'TABLE(key text, name text, saldo_awal numeric, pemasukan numeric, pengeluaran numeric, saldo_akhir numeric)',
  'public_warta_finance returns per-item aggregates only'
);

-- ---------------------------------------------------------------------------
-- As anon
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"role":"anon"}';
set local role anon;

select results_eq(
  $$ select id, tanggal, category_key, sort_order from public.public_warta_schedule('uji-fn-published') $$,
  $$ values
       ('11000000-0000-4000-8000-0000000000e2'::uuid, '2030-01-06'::date, 'umum'::text, 0),
       ('11000000-0000-4000-8000-0000000000e3'::uuid, '2030-01-06'::date, 'smka'::text, 1),
       ('11000000-0000-4000-8000-0000000000e4'::uuid, '2030-01-12'::date, 'krt'::text, 0) $$,
  'a published warta returns its service week only, by date then sort_order'
);

select results_eq(
  $$ select category_name, tempat_nama, wilayah_nama, dpa, tema, pelayan_firman_nama, liturgos_nama, pemusik_nama,
            bahan_alkitab, kehadiran_laki_laki, kehadiran_perempuan, kehadiran_anak, catatan
     from public.public_warta_schedule('uji-fn-published') $$,
  $$ values
       ('Kebaktian Minggu'::text, 'Uji Tempat'::text, null::text, null::text, null::text, 'Uji Pelayan Firman'::text,
        'Uji Liturgos'::text, null::text, null::text, 10, 12, 5, 'Keterangan uji'::text),
       ('Kebaktian SMKA', null, null, null, 'Tema SMKA', null, 'Uji Liturgos', 'Uji Pemusik', 'Bahan uji',
        null, null, null, null),
       ('Kebaktian Rumah Tangga', 'Uji Tempat', 'Uji Wilayah', 'DPA uji', 'Tema KRT', 'Uji Pelayan Firman',
        null, null, null, null, null, null, null) $$,
  'rows carry category and place names and people''s names'
);

select is(
  (select smka_kelompok from public.public_warta_schedule('uji-fn-published') where category_key = 'smka'),
  '[{"kelompok": "batita", "pf_nama": "Uji PF", "laki_laki": 1, "perempuan": 2},
    {"kelompok": "orang_tua", "pf_nama": null, "laki_laki": 0, "perempuan": null}]'::jsonb,
  'the SMKA grid lists only groups with data, in the fixed group order, with the PF by name'
);

select is(
  (select count(*) from public.public_warta_schedule('uji-fn-published')
   where category_key <> 'smka' and smka_kelompok = '[]'::jsonb),
  2::bigint,
  'non-SMKA rows have an empty SMKA grid'
);

select is_empty(
  $$ select 1 from public.public_warta_schedule('uji-fn-published') as s
     where s::text ~ '(0811|0812|0813|0814|Rahasia|1970-01-01)' $$,
  'no phone number, address, or birth date appears anywhere in the output'
);

select is_empty(
  $$ select 1 from public.public_warta_schedule('uji-fn-draft') $$,
  'a draft warta returns no schedule'
);

select is_empty(
  $$ select 1 from public.public_warta_schedule('tidak-ada-warta-ini') $$,
  'an unknown slug returns no schedule'
);

select is_empty(
  $$ select 1 from public.public_warta_finance('uji-fn-draft') $$,
  'a draft warta returns no finance report'
);

select is_empty(
  $$ select 1 from public.public_warta_finance('tidak-ada-warta-ini') $$,
  'an unknown slug returns no finance report'
);

select results_eq(
  $$ select id from public.public_jadwal_pekan_ini()
     where id in ('11000000-0000-4000-8000-0000000000f1', '11000000-0000-4000-8000-0000000000f2',
                  '11000000-0000-4000-8000-0000000000f3', '11000000-0000-4000-8000-0000000000f4') $$,
  $$ values ('11000000-0000-4000-8000-0000000000f2'::uuid), ('11000000-0000-4000-8000-0000000000f3'::uuid) $$,
  'public_jadwal_pekan_ini returns this Minggu-Sabtu week in Asia/Jakarta only'
);

select throws_ok(
  $$ select * from private.schedule_rows('2030-01-01', '2030-12-31') $$,
  '42501',
  null::text,
  'anon cannot call the private helpers directly'
);

-- ---------------------------------------------------------------------------
-- As a signed-in user without any role
-- ---------------------------------------------------------------------------
reset role;
insert into auth.users (id, email) values ('11000000-0000-4000-8000-000000000001', 'fn-tanpa-role@test.local');
set local request.jwt.claims = '{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

select is(
  (select count(*) from public.public_warta_schedule('uji-fn-published')),
  3::bigint,
  'a signed-in user without warta:read gets the same public schedule'
);

select is_empty(
  $$ select 1 from public.public_warta_schedule('uji-fn-draft') $$,
  'a signed-in user without warta:read gets no schedule for a draft'
);

select * from finish();
rollback;
