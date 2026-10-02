-- Pendeta (brief §14.7; migration 0031).
begin;
create extension if not exists pgtap with schema extensions;

select plan(28);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres). Rolled back at the end.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('2c000000-0000-4000-8000-000000000001', 'pendeta-editor@test.local'),
  ('2c000000-0000-4000-8000-000000000002', 'pendeta-viewer@test.local'),
  ('2c000000-0000-4000-8000-000000000003', 'pendeta-admin@test.local');

insert into public.user_roles (user_id, role_id)
select v.user_id::uuid, r.id
from (
  values
    ('2c000000-0000-4000-8000-000000000001', 'editor'),
    ('2c000000-0000-4000-8000-000000000002', 'viewer'),
    ('2c000000-0000-4000-8000-000000000003', 'admin')
) as v (user_id, role_name)
join public.roles r on r.name = v.role_name;

insert into storage.objects (bucket_id, name) values
  ('situs', 'pendeta/cccccccc-cccc-4ccc-8ccc-ccccccccccc1.jpg');

-- ---------------------------------------------------------------------------
-- Field rules (as postgres, so only the constraints/triggers apply)
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.pendeta (nama, peran, tahun_mulai) values ('Pdt. Masa Depan', 'Pendeta Jemaat', 2999) $$,
  '23514', null::text, 'tahun_mulai in the future is refused'
);
select throws_ok(
  $$ insert into public.pendeta (nama, peran, tahun_mulai) values ('Pdt. Terlalu Lama', 'Pendeta Jemaat', 1799) $$,
  '23514', null::text, 'tahun_mulai before 1800 is refused'
);
select throws_ok(
  $$ insert into public.pendeta (nama, peran, tahun_mulai, tahun_selesai) values ('Pdt. Rentang Salah', 'Pendeta Jemaat', 2010, 2005) $$,
  '23514', null::text, 'tahun_selesai before tahun_mulai is refused'
);
select throws_ok(
  $$ insert into public.pendeta (nama, peran, tahun_mulai, tahun_selesai) values ('Pdt. Selesai Masa Depan', 'Pendeta Jemaat', 2010, 2999) $$,
  '23514', null::text, 'tahun_selesai in the future is refused'
);
select throws_ok(
  $$ insert into public.pendeta (nama, peran, tahun_mulai, foto_path) values
       ('Pdt. Tanpa Alt', 'Pendeta Jemaat', 2015, 'pendeta/cccccccc-cccc-4ccc-8ccc-ccccccccccc1.jpg') $$,
  '23514', null::text, 'a photo without alt text is refused'
);
select throws_ok(
  $$ insert into public.pendeta (nama, peran, tahun_mulai, foto_path, foto_alt) values
       ('Pdt. Objek Hilang', 'Pendeta Jemaat', 2015, 'pendeta/dddddddd-dddd-4ddd-8ddd-ddddddddddd1.jpg', 'Foto') $$,
  '22023', 'Foto tidak ditemukan di penyimpanan.', 'a path with no object in the bucket is refused'
);
select lives_ok(
  $$ insert into public.pendeta (id, nama, peran, tahun_mulai, tahun_selesai, foto_path, foto_alt, tampil) values
       ('2c000000-0000-4000-8000-0000000000a1', 'Pdt. Sedang Melayani', 'Pendeta Jemaat', 2019, null,
        'pendeta/cccccccc-cccc-4ccc-8ccc-ccccccccccc1.jpg', 'Foto pendeta', true) $$,
  'a currently-serving pastor (tahun_selesai null) with a valid photo passes'
);
select lives_ok(
  $$ insert into public.pendeta (id, nama, peran, tahun_mulai, tahun_selesai, tampil) values
       ('2c000000-0000-4000-8000-0000000000a2', 'Pdt. Pernah Melayani Baru', 'Pendeta Jemaat', 2010, 2019, true) $$,
  'a past pastor within range passes'
);
select lives_ok(
  $$ insert into public.pendeta (id, nama, peran, tahun_mulai, tahun_selesai, tampil) values
       ('2c000000-0000-4000-8000-0000000000a3', 'Pdt. Pernah Melayani Lama', 'Pendeta Jemaat', 1990, 2005, false) $$,
  'a past pastor with tampil = false passes'
);

-- ---------------------------------------------------------------------------
-- public_pendeta(): tampil = true only, public columns only, default order
-- (currently serving first, then by tahun_selesai desc, tahun_mulai desc).
-- ---------------------------------------------------------------------------
select is(
  (
    with one as (select p from public.public_pendeta() p limit 1)
    select array_agg(k order by k) from one, jsonb_object_keys(to_jsonb(one.p)) as k
  ),
  array['foto_alt', 'foto_path', 'id', 'keterangan', 'nama', 'peran', 'tahun_mulai', 'tahun_selesai'],
  'public_pendeta() returns exactly the public columns (no tampil, no created_at)'
);
select results_eq(
  $$ select nama from public.public_pendeta() order by 1 $$,
  $$ values ('Pdt. Pernah Melayani Baru'::text), ('Pdt. Sedang Melayani'::text) $$,
  'public_pendeta() hides tampil = false rows'
);
select results_eq(
  $$ select nama from public.public_pendeta() $$,
  $$ values ('Pdt. Sedang Melayani'::text), ('Pdt. Pernah Melayani Baru'::text) $$,
  'public_pendeta() orders currently-serving first, then past pastors by tahun_selesai desc'
);

set local role anon;
select is((select count(*)::int from public.public_pendeta()), 2, 'anon reads public_pendeta() (tampil = true rows only)');
select throws_ok($$ select * from public.pendeta $$, '42501', null::text, 'anon cannot select public.pendeta directly');
select throws_ok(
  $$ insert into public.pendeta (nama, peran, tahun_mulai) values ('Anon', 'X', 2020) $$,
  '42501', null::text, 'anon cannot insert pendeta'
);
reset role;

-- ---------------------------------------------------------------------------
-- viewer: reads (situs:read), can't write
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"2c000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;

select is((select count(*)::int from public.pendeta), 3, 'viewer reads every pendeta row (tampil true and false)');
with u as (update public.pendeta set nama = 'Viewer' where id = '2c000000-0000-4000-8000-0000000000a1' returning 1)
select is(count(*)::int, 0, 'viewer cannot update pendeta') from u;
with d as (delete from public.pendeta where id = '2c000000-0000-4000-8000-0000000000a1' returning 1)
select is(count(*)::int, 0, 'viewer cannot delete pendeta') from d;
reset role;

-- ---------------------------------------------------------------------------
-- editor: add/update (situs:update), no delete (no situs:delete)
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"2c000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

select lives_ok(
  $$ insert into public.pendeta (id, nama, peran, tahun_mulai) values
       ('2c000000-0000-4000-8000-0000000000a4', 'Pdt. Baru', 'Pendeta Jemaat', 2024) $$,
  'editor adds a pendeta row'
);
with u as (update public.pendeta set peran = 'Pendeta Jemaat (Baru)' where id = '2c000000-0000-4000-8000-0000000000a1' returning 1)
select is(count(*)::int, 1, 'editor updates pendeta') from u;
with d as (delete from public.pendeta where id = '2c000000-0000-4000-8000-0000000000a4' returning 1)
select is(count(*)::int, 0, 'editor cannot delete pendeta') from d;
reset role;

-- ---------------------------------------------------------------------------
-- profil_gereja.sambutan_pendeta_id: set null on delete, admin can delete.
-- ---------------------------------------------------------------------------
update public.profil_gereja set sambutan_pendeta_id = '2c000000-0000-4000-8000-0000000000a1' where id = 1;

set local request.jwt.claims = '{"sub":"2c000000-0000-4000-8000-000000000003","role":"authenticated"}';
set local role authenticated;

with d as (delete from public.pendeta where id = '2c000000-0000-4000-8000-0000000000a1' returning 1)
select is(count(*)::int, 1, 'admin deletes a pendeta row referenced by Sambutan') from d;
select is(
  (select sambutan_pendeta_id from public.profil_gereja where id = 1),
  null::uuid,
  'profil_gereja.sambutan_pendeta_id is set null after its pendeta is deleted'
);
select lives_ok(
  $$ select public.public_profil_gereja() $$,
  'public_profil_gereja() still renders with no Sambutan pendeta'
);
select is(
  (select (public.public_profil_gereja() ->> 'sambutan_pendeta_nama')),
  null::text,
  'public_profil_gereja() has no Sambutan pendeta name once its pendeta is gone'
);

with d as (delete from public.pendeta where id = '2c000000-0000-4000-8000-0000000000a2' returning 1)
select is(count(*)::int, 1, 'admin deletes an unreferenced pendeta row') from d;
reset role;

-- ---------------------------------------------------------------------------
-- situs_referenced_photo_paths() includes pendeta (0031)
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ insert into public.pendeta (id, nama, peran, tahun_mulai, foto_path, foto_alt) values
       ('2c000000-0000-4000-8000-0000000000a5', 'Pdt. Dengan Foto', 'Pendeta Jemaat', 2020,
        'pendeta/cccccccc-cccc-4ccc-8ccc-ccccccccccc1.jpg', 'Foto') $$,
  'setup: a pendeta row with a photo for the referenced-paths check'
);
set local request.jwt.claims = '{"sub":"2c000000-0000-4000-8000-000000000003","role":"authenticated"}';
set local role authenticated;
select results_eq(
  $$ select public.situs_referenced_photo_paths() $$,
  $$ values ('pendeta/cccccccc-cccc-4ccc-8ccc-ccccccccccc1.jpg'::text) $$,
  'referenced paths include the surviving pendeta photo'
);
reset role;

select * from finish();
rollback;
