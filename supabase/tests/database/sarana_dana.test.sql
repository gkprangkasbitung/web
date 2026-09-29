-- Sarana & Dana money rules (brief §9.7, §13 #6): enforced in the database
-- (0025), not only in Next.js, since a signed-in user can call the Supabase
-- REST API directly. The report formula itself is already covered by
-- finance_report.test.sql; this file covers what 0025 added.
begin;
create extension if not exists pgtap with schema extensions;

select plan(23);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres). Rolled back at the end. Reuses the 3 real seeded
-- items (brief §5: they can't be added or removed), so their ids come from
-- lookups rather than inserts.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('16000000-0000-4000-8000-000000000001', 'sd-editor@test.local'),
  ('16000000-0000-4000-8000-000000000002', 'sd-viewer@test.local'),
  ('16000000-0000-4000-8000-000000000003', 'sd-norole@test.local');

insert into public.user_roles (user_id, role_id)
select v.user_id::uuid, r.id
from (values
  ('16000000-0000-4000-8000-000000000001', 'editor'),
  ('16000000-0000-4000-8000-000000000002', 'viewer')
) as v (user_id, role_name)
join public.roles r on r.name = v.role_name;

insert into public.jemaat (id, nama) values ('16000000-0000-4000-8000-0000000000a1', 'Uji Pemberi SD');

-- ---------------------------------------------------------------------------
-- Items can't be added or removed, even by an editor with warta:update
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub":"16000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

select throws_ok(
  $$ insert into public.sarana_dana_items (key, name) values ('uji_item_sd', 'Uji Item') $$,
  '42501', null::text, 'an editor cannot add a Sarana & Dana item'
);
-- No policy at all covers delete/update-by-the-wrong-role, so those rows are
-- simply invisible to the command (0 rows affected), not an exception -
-- matching the existing viewer-write tests in master_data.test.sql.
with d as (delete from public.sarana_dana_items where key = 'kas_sarana_prasarana' returning 1)
select is(count(*)::int, 0, 'an editor cannot delete a Sarana & Dana item') from d;
select lives_ok(
  $$ update public.sarana_dana_items set keterangan = 'Uji keterangan SD' where key = 'kas_jemaat' $$,
  'an editor can still update an item (Keterangan / Saldo Awal)'
);

reset role;
set local request.jwt.claims = '{"sub":"16000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;
with u as (update public.sarana_dana_items set keterangan = 'Ditolak' where key = 'kas_jemaat' returning 1)
select is(count(*)::int, 0, 'a viewer cannot update an item') from u;

-- ---------------------------------------------------------------------------
-- Persembahan Bulanan: tipe is always masuk, and jemaat_id is kept -
-- corrected silently (brief's "selalu"/"dipaksa"), on insert and update.
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub":"16000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

select lives_ok(
  $$ insert into public.sarana_dana_transactions (id, item_id, tanggal, tipe, jumlah, jemaat_id)
     select '16000000-0000-4000-8000-0000000000b1', id, '2030-05-01', 'keluar', 10000, '16000000-0000-4000-8000-0000000000a1'
     from public.sarana_dana_items where key = 'persembahan_bulanan' $$,
  'inserting a Persembahan Bulanan transaction as keluar is accepted (corrected, not rejected)'
);
select is(
  (select tipe from public.sarana_dana_transactions where id = '16000000-0000-4000-8000-0000000000b1'),
  'masuk'::text,
  'it is stored as masuk regardless'
);
select is(
  (select jemaat_id from public.sarana_dana_transactions where id = '16000000-0000-4000-8000-0000000000b1'),
  '16000000-0000-4000-8000-0000000000a1'::uuid,
  'its jemaat_id is kept'
);

select lives_ok(
  $$ update public.sarana_dana_transactions set tipe = 'keluar' where id = '16000000-0000-4000-8000-0000000000b1' $$,
  'updating it to keluar is also accepted'
);
select is(
  (select tipe from public.sarana_dana_transactions where id = '16000000-0000-4000-8000-0000000000b1'),
  'masuk'::text,
  'and still corrected back to masuk on update'
);

-- ---------------------------------------------------------------------------
-- Every other item: jemaat_id is always forced null, on insert and update.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ insert into public.sarana_dana_transactions (id, item_id, tanggal, tipe, jumlah, jemaat_id)
     select '16000000-0000-4000-8000-0000000000b2', id, '2030-05-01', 'masuk', 20000, '16000000-0000-4000-8000-0000000000a1'
     from public.sarana_dana_items where key = 'kas_jemaat' $$,
  'inserting a Kas Jemaat transaction with a jemaat_id is accepted (corrected, not rejected)'
);
select is(
  (select jemaat_id from public.sarana_dana_transactions where id = '16000000-0000-4000-8000-0000000000b2'),
  null::uuid,
  'its jemaat_id is forced null'
);
select is(
  (select tipe from public.sarana_dana_transactions where id = '16000000-0000-4000-8000-0000000000b2'),
  'masuk'::text,
  'its own tipe is left alone (not Persembahan Bulanan)'
);

select lives_ok(
  $$ update public.sarana_dana_transactions set jemaat_id = '16000000-0000-4000-8000-0000000000a1'
     where id = '16000000-0000-4000-8000-0000000000b2' $$,
  'setting jemaat_id on update is also accepted'
);
select is(
  (select jemaat_id from public.sarana_dana_transactions where id = '16000000-0000-4000-8000-0000000000b2'),
  null::uuid,
  'and still forced null on update'
);

-- ---------------------------------------------------------------------------
-- item_id can't change once set - a real rejection, not a correction
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ update public.sarana_dana_transactions
     set item_id = (select id from public.sarana_dana_items where key = 'kas_sarana_prasarana')
     where id = '16000000-0000-4000-8000-0000000000b2' $$,
  '22023', 'Item transaksi tidak bisa diubah.', 'item_id cannot be changed after creation'
);

-- ---------------------------------------------------------------------------
-- jumlah: whole number, >= 0, and bounded
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.sarana_dana_transactions (item_id, tanggal, tipe, jumlah)
     select id, '2030-05-01', 'masuk', 100.50 from public.sarana_dana_items where key = 'kas_jemaat' $$,
  '23514', null::text, 'a decimal jumlah is rejected'
);
select throws_ok(
  $$ insert into public.sarana_dana_transactions (item_id, tanggal, tipe, jumlah)
     select id, '2030-05-01', 'masuk', -1 from public.sarana_dana_items where key = 'kas_jemaat' $$,
  '23514', null::text, 'a negative jumlah is rejected'
);
select throws_ok(
  $$ insert into public.sarana_dana_transactions (item_id, tanggal, tipe, jumlah)
     select id, '2030-05-01', 'masuk', 10000000001 from public.sarana_dana_items where key = 'kas_jemaat' $$,
  '23514', null::text, 'a jumlah over the ceiling (Rp 10,000,000,000) is rejected'
);
select lives_ok(
  $$ insert into public.sarana_dana_transactions (item_id, tanggal, tipe, jumlah)
     select id, '2030-05-01', 'masuk', 10000000000 from public.sarana_dana_items where key = 'kas_jemaat' $$,
  'exactly the ceiling is accepted'
);
select lives_ok(
  $$ insert into public.sarana_dana_transactions (item_id, tanggal, tipe, jumlah)
     select id, '2030-05-01', 'keluar', 0 from public.sarana_dana_items where key = 'kas_jemaat' $$,
  'zero is accepted'
);

-- ---------------------------------------------------------------------------
-- public.sarana_dana_report: who may call, and it agrees with private.*
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"role":"anon"}';
set local role anon;
select throws_ok(
  $$ select * from public.sarana_dana_report('2030-01-01', '2030-01-31') $$,
  '42501', null::text, 'anon cannot call sarana_dana_report'
);

reset role;
set local request.jwt.claims = '{"sub":"16000000-0000-4000-8000-000000000003","role":"authenticated"}';
set local role authenticated;
select throws_ok(
  $$ select * from public.sarana_dana_report('2030-01-01', '2030-01-31') $$,
  '42501', 'Kamu tidak punya akses untuk tindakan ini.', 'a signed-in user without warta:read cannot call it either'
);

-- private is revoked from public (0020), so authenticated can't select from
-- it directly even to compare - capture it as postgres first.
reset role;
set local request.jwt.claims = '';
create temporary table uji_sd_private_report as
select * from private.sarana_dana_report('2030-01-01', '2030-12-31');
grant select on uji_sd_private_report to authenticated;

set local request.jwt.claims = '{"sub":"16000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;
select results_eq(
  $$ select key, saldo_awal, pemasukan, pengeluaran, saldo_akhir
     from public.sarana_dana_report('2030-01-01', '2030-12-31') order by key $$,
  $$ select key, saldo_awal, pemasukan, pengeluaran, saldo_akhir
     from uji_sd_private_report order by key $$,
  'a viewer (warta:read) gets exactly what private.sarana_dana_report computes'
);

select * from finish();
rollback;
