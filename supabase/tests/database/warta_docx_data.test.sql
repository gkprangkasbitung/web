-- Stage 12a (brief §16.1): the extra data needed by the Warta DOCX
-- generator (stage 12b). Covers what the database alone must guard, since a
-- signed-in user can call the Supabase REST API directly (CLAUDE.md):
--   1. Peribadahan's pnj_id/kehadiran_online are refused outside `umum`.
--   2. no_hp never reaches public_pendeta().
--   3. warta_pujian: permissions, and the atomic per-warta reorder RPC.
--   4. profil_gereja_jadwal_rutin: permissions and the atomic reorder RPC.
--   5. The new CHECK constraints (website_url, telepon_sekretariat, no_hp).
begin;
create extension if not exists pgtap with schema extensions;

select plan(24);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres). Rolled back at the end.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('35000000-0000-4000-8000-000000000001', 'docx-editor@test.local'),
  ('35000000-0000-4000-8000-000000000002', 'docx-viewer@test.local');

insert into public.user_roles (user_id, role_id)
select v.user_id::uuid, r.id
from (values
  ('35000000-0000-4000-8000-000000000001', 'editor'),
  ('35000000-0000-4000-8000-000000000002', 'viewer')
) as v (user_id, role_name)
join public.roles r on r.name = v.role_name;

insert into public.jemaat (id, nama) values
  ('35000000-0000-4000-8000-0000000000a1', 'Uji PNJ Satu');

insert into public.peribadahan_items (id, category_id, tanggal)
select '35000000-0000-4000-8000-0000000000d1', id, '2030-07-07'
from public.peribadahan_categories where key = 'umum';

insert into public.peribadahan_items (id, category_id, tanggal)
select '35000000-0000-4000-8000-0000000000d2', id, '2030-07-08'
from public.peribadahan_categories where key = 'pria';

insert into public.warta (slug, status, tanggal_kebaktian, judul_kebaktian) values
  ('2030-07-07-uji-pujian', 'draft', '2030-07-07', 'Uji Pujian');

insert into public.warta (slug, status, tanggal_kebaktian, judul_kebaktian) values
  ('2030-07-14-uji-pujian-lain', 'draft', '2030-07-14', 'Uji Pujian Lain');

-- ---------------------------------------------------------------------------
-- 1. Peribadahan: pnj_id / kehadiran_online, umum only
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ update public.peribadahan_items set pnj_id = '35000000-0000-4000-8000-0000000000a1', kehadiran_online = 5
     where id = '35000000-0000-4000-8000-0000000000d1' $$,
  'pnj_id and kehadiran_online are accepted on umum'
);
select throws_ok(
  $$ update public.peribadahan_items set pnj_id = '35000000-0000-4000-8000-0000000000a1'
     where id = '35000000-0000-4000-8000-0000000000d2' $$,
  '22023', null::text, 'pnj_id is refused outside umum (direct REST write)'
);
select throws_ok(
  $$ update public.peribadahan_items set kehadiran_online = 3
     where id = '35000000-0000-4000-8000-0000000000d2' $$,
  '22023', null::text, 'kehadiran_online is refused outside umum (direct REST write)'
);
select throws_ok(
  $$ update public.peribadahan_items set kehadiran_online = -1
     where id = '35000000-0000-4000-8000-0000000000d1' $$,
  '23514', null::text, 'kehadiran_online rejects a negative value'
);

set local request.jwt.claims = '{"sub":"35000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;
select throws_ok(
  $$ select public.update_peribadahan_item('35000000-0000-4000-8000-0000000000d2', p_kehadiran_online := 2) $$,
  '22023', null::text, 'update_peribadahan_item also refuses kehadiran_online outside umum'
);
select throws_ok(
  $$ select public.update_peribadahan_item('35000000-0000-4000-8000-0000000000d2', p_pnj_id := '35000000-0000-4000-8000-0000000000a1') $$,
  '22023', null::text, 'update_peribadahan_item also refuses pnj_id outside umum'
);
select lives_ok(
  $$ select public.update_peribadahan_item('35000000-0000-4000-8000-0000000000d1', p_pnj_id := '35000000-0000-4000-8000-0000000000a1', p_kehadiran_online := 10) $$,
  'update_peribadahan_item accepts both on umum'
);
select results_eq(
  $$ select pnj_id, kehadiran_online from public.peribadahan_items where id = '35000000-0000-4000-8000-0000000000d1' $$,
  $$ values ('35000000-0000-4000-8000-0000000000a1'::uuid, 10) $$,
  'the RPC actually saved pnj_id and kehadiran_online'
);
reset role;

-- ---------------------------------------------------------------------------
-- 2. no_hp never reaches any public function
-- ---------------------------------------------------------------------------
insert into public.pendeta (id, nama, peran, tahun_mulai, no_hp, tampil) values
  ('35000000-0000-4000-8000-0000000000e1', 'Pdt. Uji No HP', 'Pendeta Jemaat', 2020, '081234567890', true);
select ok(
  not (
    select to_jsonb(p) ? 'no_hp'
    from public.public_pendeta() p
    where p.id = '35000000-0000-4000-8000-0000000000e1'
  ),
  'public_pendeta() never includes the no_hp key'
);
select throws_ok(
  $$ insert into public.pendeta (nama, peran, tahun_mulai, no_hp) values ('Uji', 'X', 2020, 'bukan-nomor') $$,
  '23514', null::text, 'no_hp must be digits only, 8-15 of them'
);

-- ---------------------------------------------------------------------------
-- 3. warta_pujian: permissions + atomic per-warta reorder
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"35000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;
select throws_ok(
  $$ insert into public.warta_pujian (warta_id, buku)
     select id, 'KJ' from public.warta where slug = '2030-07-07-uji-pujian' $$,
  '42501', null::text, 'viewer cannot insert warta_pujian'
);
reset role;

set local request.jwt.claims = '{"sub":"35000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;
insert into public.warta_pujian (id, warta_id, urutan, buku, nomor)
select '35000000-0000-4000-8000-0000000000f1', id, 0, 'KJ', '1' from public.warta where slug = '2030-07-07-uji-pujian';
insert into public.warta_pujian (id, warta_id, urutan, buku, nomor)
select '35000000-0000-4000-8000-0000000000f2', id, 1, 'PKJ', '2' from public.warta where slug = '2030-07-07-uji-pujian';
insert into public.warta_pujian (id, warta_id, urutan, buku, nomor)
select '35000000-0000-4000-8000-0000000000f3', id, 0, 'NKB', '3' from public.warta where slug = '2030-07-14-uji-pujian-lain';

select throws_ok(
  $$ insert into public.warta_pujian (warta_id, buku) values ('00000000-0000-4000-8000-000000000000', 'TIDAK_DIKENAL') $$,
  '23514', null::text, 'buku must be one of KJ/PKJ/NKB/Lainnya'
);

select lives_ok(
  $$ select public.reorder_warta_pujian(
       (select id from public.warta where slug = '2030-07-07-uji-pujian'),
       array['35000000-0000-4000-8000-0000000000f2', '35000000-0000-4000-8000-0000000000f1']::uuid[]
     ) $$,
  'reorder_warta_pujian accepts exactly this warta''s current rows'
);
select results_eq(
  $$ select id from public.warta_pujian where warta_id = (select id from public.warta where slug = '2030-07-07-uji-pujian') order by urutan $$,
  $$ values ('35000000-0000-4000-8000-0000000000f2'::uuid), ('35000000-0000-4000-8000-0000000000f1'::uuid) $$,
  'the reorder actually saved the new urutan'
);
select throws_ok(
  $$ select public.reorder_warta_pujian(
       (select id from public.warta where slug = '2030-07-07-uji-pujian'),
       array['35000000-0000-4000-8000-0000000000f2']::uuid[]
     ) $$,
  '22023', null::text, 'reorder_warta_pujian rejects a list missing a row'
);
select throws_ok(
  $$ select public.reorder_warta_pujian(
       (select id from public.warta where slug = '2030-07-07-uji-pujian'),
       array['35000000-0000-4000-8000-0000000000f2', '35000000-0000-4000-8000-0000000000f3']::uuid[]
     ) $$,
  '22023', null::text, 'reorder_warta_pujian rejects a row belonging to a different warta (scoped, not global)'
);
select results_eq(
  $$ select urutan from public.warta_pujian where id = '35000000-0000-4000-8000-0000000000f3' $$,
  $$ values (0) $$,
  'the other warta''s pujian is untouched by a rejected cross-warta reorder'
);
reset role;

-- ---------------------------------------------------------------------------
-- 4. profil_gereja_jadwal_rutin: permissions + atomic reorder
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"35000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;
select throws_ok(
  $$ insert into public.profil_gereja_jadwal_rutin (nama, keterangan_waktu) values ('Uji', 'Minggu') $$,
  '42501', null::text, 'viewer cannot insert jadwal rutin'
);
reset role;

insert into public.profil_gereja_jadwal_rutin (id, nama, keterangan_waktu, sort_order) values
  ('35000000-0000-4000-8000-0000000000b1', 'Kebaktian Minggu', 'Minggu, pkl. 08.00 WIB', 0),
  ('35000000-0000-4000-8000-0000000000b2', 'Kebaktian Remaja', 'Sabtu, pkl. 16.00 WIB', 1);

set local request.jwt.claims = '{"sub":"35000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;
select lives_ok(
  $$ select public.reorder_jadwal_rutin(array['35000000-0000-4000-8000-0000000000b2', '35000000-0000-4000-8000-0000000000b1']::uuid[]) $$,
  'reorder_jadwal_rutin accepts the current full set'
);
select throws_ok(
  $$ select public.reorder_jadwal_rutin(array['35000000-0000-4000-8000-0000000000b2']::uuid[]) $$,
  '22023', null::text, 'reorder_jadwal_rutin rejects an incomplete list'
);
reset role;

-- ---------------------------------------------------------------------------
-- 5. New CHECK constraints
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ update public.profil_gereja set website_url = 'http://tidak-https.test' where id = 1 $$,
  '23514', null::text, 'website_url must be https'
);
select lives_ok(
  $$ update public.profil_gereja set website_url = 'https://gkprangkasbitung.test' where id = 1 $$,
  'a valid https website_url is accepted'
);
select throws_ok(
  $$ update public.profil_gereja set telepon_sekretariat = 'bukan-angka' where id = 1 $$,
  '23514', null::text, 'telepon_sekretariat must be digits only'
);
select lives_ok(
  $$ update public.profil_gereja set telepon_sekretariat = '0215550000' where id = 1 $$,
  'a valid telepon_sekretariat is accepted'
);

select * from finish();
rollback;
