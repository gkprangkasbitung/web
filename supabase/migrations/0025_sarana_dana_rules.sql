-- Sarana & Dana (brief §9.7): the money rules are enforced here, in the
-- database, not only in Next.js — a signed-in user can call the Supabase
-- REST API directly with their own session token, bypassing any check that
-- lives only in a route handler (CLAUDE.md's hard rule).

-- jumlah is a whole number of Rupiah (no cents), non-negative, with a
-- generous ceiling (Rp 10,000,000,000) to catch an obvious typo (e.g. extra
-- digits) without rejecting a real, large transaction. The column stays
-- numeric(14,2) (0008): changing its scale could silently round an existing
-- bad value instead of rejecting it, and this constraint already forces
-- whole numbers going forward.
alter table public.sarana_dana_transactions
  add constraint sarana_dana_transactions_jumlah_bounds_check check (
    jumlah = trunc(jumlah) and jumlah >= 0 and jumlah <= 10000000000
  );

-- Persembahan Bulanan is always `masuk`, and jemaat_id is kept only for
-- Persembahan Bulanan — both corrected silently (the brief's "selalu"/
-- "dipaksa" wording), whatever the caller sends. item_id, once set, can
-- never change: that's a real error, not something to coerce.
create or replace function private.enforce_sarana_dana_transaction_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_key text;
begin
  if tg_op = 'UPDATE' and new.item_id is distinct from old.item_id then
    raise exception using errcode = '22023', message = 'Item transaksi tidak bisa diubah.';
  end if;

  select key into v_key from public.sarana_dana_items where id = new.item_id;

  if v_key = 'persembahan_bulanan' then
    new.tipe := 'masuk';
  else
    new.jemaat_id := null;
  end if;

  return new;
end;
$$;

create trigger sarana_dana_transactions_enforce_rules
  before insert or update on public.sarana_dana_transactions
  for each row execute function private.enforce_sarana_dana_transaction_rules();

-- Items can't be added or removed from the app (brief §9.7: "three fixed
-- items"). Narrows the old "for all" policy (0003) to update only, so
-- insert/delete are refused for everyone at the RLS layer too, not only by
-- omitting the UI. Accepted like 0019's policy replacements: the project is
-- new and 0001-0017 stay unedited, only the policy they created is replaced.
drop policy "sarana_dana_items_write" on public.sarana_dana_items;

create policy "sarana_dana_items_update" on public.sarana_dana_items
  for update
  using (public.has_permission(auth.uid(), 'warta', 'update'))
  with check (public.has_permission(auth.uid(), 'warta', 'update'));

-- Exposes the one finance-report formula (private.sarana_dana_report, 0020)
-- to the admin app, so the ledger's future warta finance tab (stage 9) and
-- the public site (public_warta_finance, 0020) compute from the exact same
-- function instead of two copies of the formula.
-- SECURITY DEFINER, like public_warta_finance: `private` is revoked from
-- `public` (0020), so a plain invoker call from `authenticated` can't reach
-- it. Safe here because the permission check happens first, same pattern as
-- every other DEFINER function in this codebase.
create or replace function public.sarana_dana_report(p_start date, p_end date)
returns table (
  key text,
  name text,
  saldo_awal numeric,
  pemasukan numeric,
  pengeluaran numeric,
  saldo_akhir numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_permission(auth.uid(), 'warta', 'read') then
    raise exception using errcode = '42501', message = 'Kamu tidak punya akses untuk tindakan ini.';
  end if;
  return query select * from private.sarana_dana_report(p_start, p_end);
end;
$$;

revoke all on function public.sarana_dana_report(date, date) from public, anon;
grant execute on function public.sarana_dana_report(date, date) to authenticated;
