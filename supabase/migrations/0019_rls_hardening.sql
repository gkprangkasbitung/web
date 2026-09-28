-- RLS hardening (brief §12.1). Until now anyone holding the anon key (which
-- ships to every browser) could read jemaat (phone numbers, addresses, birth
-- dates), keluarga, and every Sarana & Dana transaction including who gave
-- how much, plus the rest of the master data.
--
-- From here on the public site reads only published warta (with their Litbang
-- and Kesaksian rows) directly; the schedule and the finance report reach it
-- through the narrow functions in 0020. Everything else needs a signed-in
-- user with warta:read. The write policies are unchanged.
--
-- The brief (§3) says not to drop existing policies. The select policies
-- below are dropped and recreated under the same names anyway: the project
-- is new and empty, 0001-0017 stay untouched, and a replaced policy reads
-- more clearly than a permissive `using (true)` left in place next to a
-- restrictive one.

-- ---------------------------------------------------------------------------
-- Select: signed-in users with warta:read only
-- ---------------------------------------------------------------------------
drop policy "peribadahan_categories_select" on public.peribadahan_categories;
create policy "peribadahan_categories_select" on public.peribadahan_categories
  for select to authenticated
  using ((select public.has_permission((select auth.uid()), 'warta', 'read')));

drop policy "peribadahan_items_select" on public.peribadahan_items;
create policy "peribadahan_items_select" on public.peribadahan_items
  for select to authenticated
  using ((select public.has_permission((select auth.uid()), 'warta', 'read')));

drop policy "peribadahan_smka_kelompok_select" on public.peribadahan_smka_kelompok;
create policy "peribadahan_smka_kelompok_select" on public.peribadahan_smka_kelompok
  for select to authenticated
  using ((select public.has_permission((select auth.uid()), 'warta', 'read')));

drop policy "tempat_select" on public.tempat;
create policy "tempat_select" on public.tempat
  for select to authenticated
  using ((select public.has_permission((select auth.uid()), 'warta', 'read')));

drop policy "wilayah_select" on public.wilayah;
create policy "wilayah_select" on public.wilayah
  for select to authenticated
  using ((select public.has_permission((select auth.uid()), 'warta', 'read')));

drop policy "jemaat_select" on public.jemaat;
create policy "jemaat_select" on public.jemaat
  for select to authenticated
  using ((select public.has_permission((select auth.uid()), 'warta', 'read')));

drop policy "keluarga_select" on public.keluarga;
create policy "keluarga_select" on public.keluarga
  for select to authenticated
  using ((select public.has_permission((select auth.uid()), 'warta', 'read')));

drop policy "label_jemaat_select" on public.label_jemaat;
create policy "label_jemaat_select" on public.label_jemaat
  for select to authenticated
  using ((select public.has_permission((select auth.uid()), 'warta', 'read')));

drop policy "jemaat_labels_select" on public.jemaat_labels;
create policy "jemaat_labels_select" on public.jemaat_labels
  for select to authenticated
  using ((select public.has_permission((select auth.uid()), 'warta', 'read')));

drop policy "sarana_dana_items_select" on public.sarana_dana_items;
create policy "sarana_dana_items_select" on public.sarana_dana_items
  for select to authenticated
  using ((select public.has_permission((select auth.uid()), 'warta', 'read')));

drop policy "sarana_dana_transactions_select" on public.sarana_dana_transactions;
create policy "sarana_dana_transactions_select" on public.sarana_dana_transactions
  for select to authenticated
  using ((select public.has_permission((select auth.uid()), 'warta', 'read')));

-- ---------------------------------------------------------------------------
-- sarana_dana_balances ran with its owner's rights, so it bypassed RLS on
-- the two tables it reads, and 0008 granted it to anon. It now runs with the
-- caller's rights: a balance is visible only to whoever can read the ledger.
-- ---------------------------------------------------------------------------
alter view public.sarana_dana_balances set (security_invoker = true);

-- ---------------------------------------------------------------------------
-- Defense in depth: anon keeps table privileges only where the public site
-- reads directly. Everything else now fails with "permission denied" instead
-- of relying on RLS alone to return nothing. RLS still limits these three
-- tables to published warta.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
grant select on public.warta, public.warta_litbang_items, public.warta_kesaksian_items to anon;

-- ---------------------------------------------------------------------------
-- profiles_update (0001) lets every user update any column of their own row,
-- so anyone signed in could claim a jemaat record (jemaat_id) or overwrite
-- their email through the REST API. Only the name and avatar stay writable.
-- jemaat_id changes go through link_user_jemaat() (0022), and email is kept
-- in sync by the auth trigger from 0001.
-- ---------------------------------------------------------------------------
revoke update on public.profiles from authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;
