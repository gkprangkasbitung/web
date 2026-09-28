-- The public finance report (brief §8 item 5, §9.7): per-item aggregates for
-- the week before tanggal kebaktian.
--   Saldo Awal  = saldo_awal + net of every transaction dated before start
--   Pemasukan   = sum of masuk in range
--   Pengeluaran = sum of keluar in range
--   Saldo Akhir = Saldo Awal + Pemasukan - Pengeluaran
begin;
create extension if not exists pgtap with schema extensions;

select plan(6);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres). Tanggal kebaktian 2030-01-13, so the finance week
-- is 2030-01-06 .. 2030-01-12. Existing transactions are cleared inside this
-- transaction so the figures below are exact; everything is rolled back.
-- ---------------------------------------------------------------------------
delete from public.sarana_dana_transactions;

update public.sarana_dana_items set saldo_awal = 1000000 where key = 'kas_jemaat';
update public.sarana_dana_items set saldo_awal = 500000 where key = 'kas_sarana_prasarana';
update public.sarana_dana_items set saldo_awal = 0 where key = 'persembahan_bulanan';

insert into public.jemaat (id, nama) values ('12000000-0000-4000-8000-0000000000a1', 'Uji Pemberi');

insert into public.warta (slug, status, tanggal_kebaktian, judul_kebaktian) values
  ('uji-fin-published', 'published', '2030-01-13', 'Uji Keuangan'),
  ('uji-fin-draft', 'draft', '2030-01-13', 'Uji Keuangan Draft');

insert into public.sarana_dana_transactions (item_id, tanggal, tipe, jumlah, jemaat_id)
select i.id, t.tanggal::date, t.tipe, t.jumlah, t.jemaat_id::uuid
from (
  values
    -- Kas Jemaat
    ('kas_jemaat', '2029-12-01', 'keluar', 50000, null),   -- before start: Saldo Awal
    ('kas_jemaat', '2030-01-05', 'masuk', 200000, null),   -- start - 1: Saldo Awal
    ('kas_jemaat', '2030-01-06', 'masuk', 300000, null),   -- start: in range
    ('kas_jemaat', '2030-01-09', 'masuk', 100000, null),   -- in range
    ('kas_jemaat', '2030-01-12', 'keluar', 75000, null),   -- end: in range
    ('kas_jemaat', '2030-01-13', 'masuk', 999000, null),   -- tanggal kebaktian: ignored
    ('kas_jemaat', '2030-02-01', 'keluar', 1, null),       -- later: ignored
    -- Persembahan Bulanan
    ('persembahan_bulanan', '2030-01-08', 'masuk', 250000, '12000000-0000-4000-8000-0000000000a1')
    -- Kas Sarana dan Prasarana: no transactions
) as t (item_key, tanggal, tipe, jumlah, jemaat_id)
join public.sarana_dana_items i on i.key = t.item_key;

-- ---------------------------------------------------------------------------
-- As anon
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"role":"anon"}';
set local role anon;

select results_eq(
  $$ select key, name, saldo_awal, pemasukan, pengeluaran, saldo_akhir
     from public.public_warta_finance('uji-fin-published') $$,
  $$ values
       ('kas_jemaat'::text, 'Kas Jemaat'::text, 1150000::numeric, 400000::numeric, 75000::numeric, 1475000::numeric),
       ('kas_sarana_prasarana', 'Kas Sarana dan Prasarana', 500000, 0, 0, 500000),
       ('persembahan_bulanan', 'Persembahan Bulanan', 0, 250000, 0, 250000) $$,
  'every item gets Saldo Awal, Pemasukan, Pengeluaran, and Saldo Akhir per §9.7, ordered by name'
);

select ok(
  (select bool_and(saldo_akhir = saldo_awal + pemasukan - pengeluaran)
   from public.public_warta_finance('uji-fin-published')),
  'Saldo Akhir = Saldo Awal + Pemasukan - Pengeluaran on every row'
);

select is_empty(
  $$ select 1 from public.public_warta_finance('uji-fin-draft') $$,
  'a draft warta returns no finance report'
);

select throws_ok(
  $$ select * from public.sarana_dana_transactions $$,
  '42501',
  null::text,
  'anon still cannot read individual transactions'
);

-- ---------------------------------------------------------------------------
-- Consistency with the current balance (as postgres): a report whose range
-- starts after every transaction opens at the balance shown in
-- sarana_dana_balances.
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '';

select results_eq(
  $$ select key, saldo_awal from private.sarana_dana_report('2031-01-04', '2031-01-10') order by key $$,
  $$ select key, saldo from public.sarana_dana_balances order by key $$,
  'the report''s opening balance after the last transaction equals the current balance'
);

-- The next week's report opens where this one closed.
select results_eq(
  $$ select key, saldo_awal from private.sarana_dana_report('2030-01-13', '2030-01-19') order by key $$,
  $$ select key, saldo_akhir from private.sarana_dana_report('2030-01-06', '2030-01-12') order by key $$,
  'the next week opens at the previous week''s Saldo Akhir'
);

select * from finish();
rollback;
