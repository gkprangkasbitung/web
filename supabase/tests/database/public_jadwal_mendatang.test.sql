-- public_jadwal_mendatang() (0027): the next 7 days in Asia/Jakarta for the
-- public Jadwal Ibadah page, computed inside the function, with people by name
-- only and no attendance, catatan, or SMKA grid.
begin;
create extension if not exists pgtap with schema extensions;

select plan(11);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres), relative to today in Asia/Jakarta: one row the day
-- before, today, today + 6 (the last day), and today + 7 (excluded).
-- ---------------------------------------------------------------------------
insert into public.tempat (id, nama) values ('12000000-0000-4000-8000-0000000000c1', 'Uji Tempat Mendatang');
insert into public.jemaat (id, nama, no_hp, alamat, tanggal_lahir, pekerjaan) values
  ('12000000-0000-4000-8000-0000000000a1', 'Uji Pelayan Mendatang', '0899', 'Jl. Rahasia 9', '1969-01-01', 'Pekerjaan Rahasia');

insert into public.peribadahan_items (
  id, category_id, tanggal, jam, sort_order, tempat_id, pelayan_firman_id, tema,
  kehadiran_laki_laki, kehadiran_perempuan, kehadiran_anak, catatan
)
select v.id::uuid, c.id, t.today + v.offset_days, '08:00', 0,
  '12000000-0000-4000-8000-0000000000c1', '12000000-0000-4000-8000-0000000000a1', 'Tema uji mendatang',
  7, 8, 9, 'Catatan internal uji'
from (select (now() at time zone 'Asia/Jakarta')::date as today) as t
cross join (
  values
    ('12000000-0000-4000-8000-0000000000e1', -1),
    ('12000000-0000-4000-8000-0000000000e2', 0),
    ('12000000-0000-4000-8000-0000000000e3', 6),
    ('12000000-0000-4000-8000-0000000000e4', 7)
) as v (id, offset_days)
join public.peribadahan_categories c on c.key = 'umum';

-- ---------------------------------------------------------------------------
-- Definition
-- ---------------------------------------------------------------------------
select ok(
  (select p.prosecdef from pg_proc p where p.oid = 'public.public_jadwal_mendatang()'::regprocedure),
  'public_jadwal_mendatang is SECURITY DEFINER'
);

select is(
  (select p.proconfig from pg_proc p where p.oid = 'public.public_jadwal_mendatang()'::regprocedure),
  array['search_path=""'],
  'public_jadwal_mendatang runs with an empty search_path'
);

select is(
  (select count(*) from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'public_jadwal_mendatang' and p.pronargs > 0),
  0::bigint,
  'there is no overload that takes a date range'
);

select is(
  (select array_agg(a.grantee::regrole::text order by a.grantee::regrole::text)
   from pg_proc p, aclexplode(p.proacl) a
   where p.oid = 'public.public_jadwal_mendatang()'::regprocedure
     and a.privilege_type = 'EXECUTE' and a.grantee <> p.proowner),
  array['anon', 'authenticated'],
  'executable by anon and authenticated only (not PUBLIC, not service_role)'
);

select is(
  pg_get_function_result('public.public_jadwal_mendatang()'::regprocedure),
  'TABLE(id uuid, tanggal date, jam time without time zone, sort_order integer, category_key text, '
  'category_name text, tempat_nama text, wilayah_nama text, dpa text, tema text, pelayan_firman_nama text, '
  'liturgos_nama text, pemusik_nama text, bahan_alkitab text)',
  'returns schedule columns and names only: no attendance, catatan, or SMKA grid'
);

-- ---------------------------------------------------------------------------
-- As anon
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"role":"anon"}';
set local role anon;

select results_eq(
  $$ select id from public.public_jadwal_mendatang()
     where id in ('12000000-0000-4000-8000-0000000000e1', '12000000-0000-4000-8000-0000000000e2',
                  '12000000-0000-4000-8000-0000000000e3', '12000000-0000-4000-8000-0000000000e4')
     order by tanggal $$,
  $$ values ('12000000-0000-4000-8000-0000000000e2'::uuid), ('12000000-0000-4000-8000-0000000000e3'::uuid) $$,
  'returns today through today + 6 in Asia/Jakarta only'
);

select results_eq(
  $$ select category_name, tempat_nama, tema, pelayan_firman_nama from public.public_jadwal_mendatang()
     where id = '12000000-0000-4000-8000-0000000000e2' $$,
  $$ values ('Kebaktian Minggu'::text, 'Uji Tempat Mendatang'::text, 'Tema uji mendatang'::text, 'Uji Pelayan Mendatang'::text) $$,
  'rows carry the category, place, and the person''s name'
);

select is_empty(
  $$ select 1 from public.public_jadwal_mendatang() as s
     where s::text ~ '(0899|Rahasia|1969-01-01|Catatan internal uji)' $$,
  'no phone number, address, birth date, occupation, or catatan appears in the output'
);

select throws_ok(
  $$ select id from public.jemaat $$,
  '42501',
  null::text,
  'anon still cannot read jemaat directly'
);

-- ---------------------------------------------------------------------------
-- As a signed-in user without any role
-- ---------------------------------------------------------------------------
reset role;
insert into auth.users (id, email) values ('12000000-0000-4000-8000-000000000001', 'mendatang-tanpa-role@test.local');
set local request.jwt.claims = '{"sub":"12000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

select is(
  (select count(*) from public.public_jadwal_mendatang()
   where id in ('12000000-0000-4000-8000-0000000000e2', '12000000-0000-4000-8000-0000000000e3')),
  2::bigint,
  'a signed-in user without warta:read gets the same public schedule'
);

reset role;
select is(
  (select count(*) from public.public_jadwal_mendatang()
   where id in ('12000000-0000-4000-8000-0000000000e1', '12000000-0000-4000-8000-0000000000e4')),
  0::bigint,
  'the day before and today + 7 are excluded for every caller'
);

select * from finish();
rollback;
