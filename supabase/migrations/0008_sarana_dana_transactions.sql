-- Turns Sarana & Dana from a single manually-typed "current amount" into a
-- proper ledger: sarana_dana_items keeps a `saldo_awal` (opening balance,
-- renamed from `nominal`), and every income/expense is logged as its own
-- row in sarana_dana_transactions. The current balance is always
-- saldo_awal + sum(masuk) - sum(keluar), computed by the
-- sarana_dana_balances view so every reader (admin pages, warta, the
-- public site) uses the same number instead of re-deriving it.

alter table public.sarana_dana_items rename column nominal to saldo_awal;

create table public.sarana_dana_transactions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.sarana_dana_items (id) on delete cascade,
  tanggal date not null,
  tipe text not null check (tipe in ('masuk', 'keluar')),
  jumlah numeric(14, 2) not null check (jumlah >= 0),
  keterangan text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index sarana_dana_transactions_item_tanggal_idx
  on public.sarana_dana_transactions (item_id, tanggal desc);

alter table public.sarana_dana_transactions enable row level security;

-- Same live-shared, public-read model as the rest of Sarana & Dana /
-- Peribadahan: the ledger is meant to be transparent to the congregation.
create policy "sarana_dana_transactions_select" on public.sarana_dana_transactions
  for select using (true);

create policy "sarana_dana_transactions_write" on public.sarana_dana_transactions
  for all
  using (public.has_permission(auth.uid(), 'warta', 'update'))
  with check (public.has_permission(auth.uid(), 'warta', 'update'));

create view public.sarana_dana_balances as
select
  i.id,
  i.key,
  i.name,
  i.keterangan,
  i.saldo_awal
    + coalesce(sum(case when t.tipe = 'masuk' then t.jumlah else -t.jumlah end), 0) as saldo
from public.sarana_dana_items i
left join public.sarana_dana_transactions t on t.item_id = i.id
group by i.id, i.key, i.name, i.keterangan, i.saldo_awal;

grant select on public.sarana_dana_balances to anon, authenticated;
