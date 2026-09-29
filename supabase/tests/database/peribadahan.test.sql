-- update_peribadahan_item and search_peribadahan_item_ids (brief §9.5,
-- §12.6): who may call, the negative-attendance floor, the SMKA grid's
-- all-or-nothing upsert, and that search respects RLS like a normal read.
begin;
create extension if not exists pgtap with schema extensions;

select plan(28);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres). Rolled back at the end.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('15000000-0000-4000-8000-000000000001', 'per-editor@test.local'),
  ('15000000-0000-4000-8000-000000000002', 'per-viewer@test.local'),
  ('15000000-0000-4000-8000-000000000003', 'per-norole@test.local');

insert into public.user_roles (user_id, role_id)
select v.user_id::uuid, r.id
from (values
  ('15000000-0000-4000-8000-000000000001', 'editor'),
  ('15000000-0000-4000-8000-000000000002', 'viewer')
) as v (user_id, role_name)
join public.roles r on r.name = v.role_name;

insert into public.jemaat (id, nama) values
  ('15000000-0000-4000-8000-0000000000a1', 'Uji PF Peribadahan Satu'),
  ('15000000-0000-4000-8000-0000000000a2', 'Uji PF Peribadahan Dua');

-- peribadahan_categories is seeded reference data (0005/0007); reuse it.
insert into public.peribadahan_items (id, category_id, tanggal)
select '15000000-0000-4000-8000-0000000000d1', id, '2025-11-30'
from public.peribadahan_categories where key = 'umum';

insert into public.peribadahan_items (id, category_id, tanggal, tema)
select '15000000-0000-4000-8000-0000000000d2', id, '2025-11-30', 'Uji Cari SMKA Tema'
from public.peribadahan_categories where key = 'smka';

-- ---------------------------------------------------------------------------
-- Who may call
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"role":"anon"}';
set local role anon;
select throws_ok(
  $$ select public.update_peribadahan_item('15000000-0000-4000-8000-0000000000d1') $$,
  '42501', null::text, 'anon cannot call update_peribadahan_item'
);
select throws_ok(
  $$ select public.search_peribadahan_item_ids('tema') $$,
  '42501', null::text, 'anon cannot call search_peribadahan_item_ids'
);

reset role;
set local request.jwt.claims = '{"sub":"15000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;
select throws_ok(
  $$ select public.update_peribadahan_item('15000000-0000-4000-8000-0000000000d1') $$,
  '42501', 'Kamu tidak punya akses untuk tindakan ini.', 'viewer cannot call update_peribadahan_item'
);
select results_eq(
  $$ select id from public.search_peribadahan_item_ids('uji cari smka') $$,
  $$ values ('15000000-0000-4000-8000-0000000000d2'::uuid) $$,
  'viewer (warta:read) can search, case-insensitively'
);
select is(
  (select count(*) from public.search_peribadahan_item_ids('')),
  0::bigint,
  'a blank search matches nothing'
);
select lives_ok(
  $$ select public.search_peribadahan_item_ids('tema),(select 1) --') $$,
  'a search string full of commas, parens, and dashes causes no error: p_search is a bound parameter, never built into a filter string (brief §13)'
);

reset role;
set local request.jwt.claims = '{"sub":"15000000-0000-4000-8000-000000000003","role":"authenticated"}';
set local role authenticated;
select is(
  (select count(*) from public.search_peribadahan_item_ids('uji cari smka')),
  0::bigint,
  'a signed-in user without warta:read finds nothing (RLS, not a permission check in the function)'
);

-- ---------------------------------------------------------------------------
-- editor: general fields, not found, and the negative-attendance floor
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub":"15000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

select throws_ok(
  $$ select public.update_peribadahan_item('15000000-0000-4000-8000-0000000000ff') $$,
  'P0002', 'Jadwal tidak ditemukan.', 'an unknown item id is rejected'
);

select lives_ok(
  $$ select public.update_peribadahan_item(
       p_id => '15000000-0000-4000-8000-0000000000d1', p_jam => '09:00',
       p_pelayan_firman_id => '15000000-0000-4000-8000-0000000000a1',
       p_tema => 'Uji Tema Umum', p_kehadiran_laki_laki => 10, p_kehadiran_perempuan => 12
     ) $$,
  'editor can save the general fields of a schedule row'
);
select results_eq(
  $$ select jam::text, pelayan_firman_id, tema, kehadiran_laki_laki, kehadiran_perempuan, kehadiran_anak
     from public.peribadahan_items where id = '15000000-0000-4000-8000-0000000000d1' $$,
  $$ values (
       '09:00:00'::text, '15000000-0000-4000-8000-0000000000a1'::uuid, 'Uji Tema Umum'::text,
       10::int, 12::int, null::int
     ) $$,
  'the saved fields, and only those, are set'
);

select throws_ok(
  $$ select public.update_peribadahan_item('15000000-0000-4000-8000-0000000000d1', p_kehadiran_laki_laki => -1) $$,
  '22023', 'Jumlah kehadiran tidak boleh negatif.', 'negative kehadiran is rejected'
);
select is(
  (select kehadiran_laki_laki from public.peribadahan_items where id = '15000000-0000-4000-8000-0000000000d1'),
  10,
  'the rejected call changed nothing'
);

select throws_ok(
  $$ select public.update_peribadahan_item(
       '15000000-0000-4000-8000-0000000000d1', p_smka_kelompok => '[]'::jsonb
     ) $$,
  '22023', 'Data kelompok SMKA tidak berlaku untuk kategori ini.', 'a non-SMKA row rejects grid data'
);

-- ---------------------------------------------------------------------------
-- editor: Kebaktian SMKA's grid, saved atomically
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select public.update_peribadahan_item('15000000-0000-4000-8000-0000000000d2') $$,
  '22023', 'Data kelompok SMKA tidak lengkap.', 'SMKA with no grid at all is rejected'
);
select throws_ok(
  $$ select public.update_peribadahan_item(
       '15000000-0000-4000-8000-0000000000d2',
       p_smka_kelompok => '[{"kelompok":"batita"}]'::jsonb
     ) $$,
  '22023', 'Data kelompok SMKA tidak lengkap.', 'SMKA with fewer than 8 groups is rejected'
);
select throws_ok(
  $$ select public.update_peribadahan_item(
       '15000000-0000-4000-8000-0000000000d2',
       p_smka_kelompok => '[
         {"kelompok":"batita"},{"kelompok":"balita"},{"kelompok":"kecil"},{"kelompok":"tanggung"},
         {"kelompok":"besar"},{"kelompok":"tunas_remaja"},{"kelompok":"guru_sekolah_minggu"},
         {"kelompok":"bukan_kelompok"}
       ]'::jsonb
     ) $$,
  '22023', 'Data kelompok SMKA tidak valid.', 'an unknown group key is rejected'
);
select throws_ok(
  $$ select public.update_peribadahan_item(
       '15000000-0000-4000-8000-0000000000d2',
       p_smka_kelompok => '[
         {"kelompok":"batita"},{"kelompok":"batita"},{"kelompok":"kecil"},{"kelompok":"tanggung"},
         {"kelompok":"besar"},{"kelompok":"tunas_remaja"},{"kelompok":"guru_sekolah_minggu"},
         {"kelompok":"orang_tua"}
       ]'::jsonb
     ) $$,
  '22023', 'Data kelompok SMKA tidak valid.', 'a duplicated group key (only 7 distinct) is rejected'
);

select throws_ok(
  $$ select public.update_peribadahan_item(
       '15000000-0000-4000-8000-0000000000d2',
       p_smka_kelompok => '[
         {"kelompok":"batita","laki_laki":-1},{"kelompok":"balita"},{"kelompok":"kecil"},{"kelompok":"tanggung"},
         {"kelompok":"besar"},{"kelompok":"tunas_remaja"},{"kelompok":"guru_sekolah_minggu"},{"kelompok":"orang_tua"}
       ]'::jsonb
     ) $$,
  '22023', 'Jumlah kehadiran tidak boleh negatif.', 'a negative count inside the grid is rejected'
);
select is(
  (select count(*) from public.peribadahan_smka_kelompok where item_id = '15000000-0000-4000-8000-0000000000d2'),
  0::bigint,
  'the rejected grid call wrote none of the 8 rows (atomic, brief §13 #7)'
);

select lives_ok(
  $$ select public.update_peribadahan_item(
       '15000000-0000-4000-8000-0000000000d2',
       p_smka_kelompok => '[
         {"kelompok":"batita","pf_id":"15000000-0000-4000-8000-0000000000a1","laki_laki":1,"perempuan":2},
         {"kelompok":"balita","laki_laki":0,"perempuan":0},
         {"kelompok":"kecil"},{"kelompok":"tanggung"},{"kelompok":"besar"},{"kelompok":"tunas_remaja"},
         {"kelompok":"guru_sekolah_minggu","pf_id":"15000000-0000-4000-8000-0000000000a2","laki_laki":3,"perempuan":4},
         {"kelompok":"orang_tua","laki_laki":5,"perempuan":6}
       ]'::jsonb
     ) $$,
  'a complete, valid grid saves'
);
select is(
  (select count(*) from public.peribadahan_smka_kelompok where item_id = '15000000-0000-4000-8000-0000000000d2'),
  8::bigint,
  'all 8 groups are saved'
);
select results_eq(
  $$ select pf_id, laki_laki, perempuan from public.peribadahan_smka_kelompok
     where item_id = '15000000-0000-4000-8000-0000000000d2' and kelompok = 'batita' $$,
  $$ values ('15000000-0000-4000-8000-0000000000a1'::uuid, 1, 2) $$,
  'a kelas group keeps its PF'
);
select results_eq(
  $$ select pf_id from public.peribadahan_smka_kelompok
     where item_id = '15000000-0000-4000-8000-0000000000d2' and kelompok = 'guru_sekolah_minggu' $$,
  $$ values (null::uuid) $$,
  'Guru Sekolah Minggu''s pf_id is ignored even when one is sent'
);

select lives_ok(
  $$ select public.update_peribadahan_item(
       '15000000-0000-4000-8000-0000000000d2',
       p_smka_kelompok => '[
         {"kelompok":"batita","laki_laki":9,"perempuan":9},{"kelompok":"balita"},{"kelompok":"kecil"},
         {"kelompok":"tanggung"},{"kelompok":"besar"},{"kelompok":"tunas_remaja"},
         {"kelompok":"guru_sekolah_minggu"},{"kelompok":"orang_tua"}
       ]'::jsonb
     ) $$,
  're-saving the grid upserts rather than duplicating'
);
select is(
  (select count(*) from public.peribadahan_smka_kelompok where item_id = '15000000-0000-4000-8000-0000000000d2'),
  8::bigint,
  'still exactly 8 rows after the second save'
);
select is(
  (select laki_laki from public.peribadahan_smka_kelompok
   where item_id = '15000000-0000-4000-8000-0000000000d2' and kelompok = 'batita'),
  9,
  'the second save''s values replaced the first''s'
);

-- ---------------------------------------------------------------------------
-- Check constraints hold even for a direct write (defense in depth)
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ update public.peribadahan_items set kehadiran_anak = -1 where id = '15000000-0000-4000-8000-0000000000d1' $$,
  '23514', null::text, 'peribadahan_items.kehadiran_* rejects a negative value at the table level'
);
select throws_ok(
  $$ update public.peribadahan_smka_kelompok set perempuan = -1
     where item_id = '15000000-0000-4000-8000-0000000000d2' and kelompok = 'balita' $$,
  '23514', null::text, 'peribadahan_smka_kelompok.laki_laki/perempuan rejects a negative value at the table level'
);

select * from finish();
rollback;
