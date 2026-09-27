-- Each Peribadahan category now has its own explicit set of fields instead
-- of a generic Hari/Jam/Tempat/Petugas/Label shape:
--   1. Kebaktian Minggu, Kebaktian Rumah Tangga, Pemahaman Alkitab,
--      Kebaktian Lansia, Kebaktian Perempuan, Kebaktian Pria, Doa Pagi,
--      Kebaktian Pemuda Remaja all share one shape (this migration extends
--      peribadahan_items with the union of their fields; each category's
--      admin page only shows/uses the subset that applies to it).
--   2. Kebaktian SMKA is structurally different (per-class pelayan +
--      attendance broken down into 8 groups), so it gets its own child
--      table, peribadahan_smka_kelompok, one row per (item, kelompok).
--
-- hari is dropped (redundant with tanggal, and not part of the new field
-- lists). label is dropped - the old free-text sub-item distinguisher is no
-- longer needed since multiple rows for the same date/category are now
-- distinguished by their own fields (e.g. differing Waktu/Tempat/Wilayah).
-- petugas_id is renamed to pelayan_firman_id to match its actual role.

alter table public.peribadahan_items
  drop column if exists label,
  drop column if exists hari;

alter table public.peribadahan_items
  rename column petugas_id to pelayan_firman_id;

alter table public.peribadahan_items
  rename constraint peribadahan_items_petugas_id_fkey to peribadahan_items_pelayan_firman_id_fkey;

-- Wilayah master data (Kebaktian Rumah Tangga's dropdown), same pattern as
-- Tempat: public read, warta:update write. Created before the alter below
-- since peribadahan_items.wilayah_id references it.
create table if not exists public.wilayah (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.wilayah enable row level security;

create policy "wilayah_select" on public.wilayah
  for select using (true);

create policy "wilayah_write" on public.wilayah
  for all
  using (public.has_permission(auth.uid(), 'warta', 'update'))
  with check (public.has_permission(auth.uid(), 'warta', 'update'));

alter table public.peribadahan_items
  add column if not exists liturgos_id uuid references public.jemaat (id) on delete set null,
  add column if not exists wilayah_id uuid references public.wilayah (id) on delete set null,
  add column if not exists tema text,
  add column if not exists dpa text,
  add column if not exists catatan text,
  add column if not exists kehadiran_laki_laki int,
  add column if not exists kehadiran_perempuan int,
  add column if not exists kehadiran_anak int,
  -- Kebaktian SMKA only:
  add column if not exists pemusik_id uuid references public.jemaat (id) on delete set null,
  add column if not exists bahan_alkitab text;

-- Kebaktian SMKA's per-class breakdown: PF (pelayan firman) for the 6
-- kelas groups, plus attendance (laki_laki/perempuan) for all 8 groups
-- (the 6 kelas plus Guru Sekolah Minggu and Orang Tua, which have no PF).
create table if not exists public.peribadahan_smka_kelompok (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.peribadahan_items (id) on delete cascade,
  kelompok text not null check (
    kelompok in (
      'batita', 'balita', 'kecil', 'tanggung', 'besar', 'tunas_remaja',
      'guru_sekolah_minggu', 'orang_tua'
    )
  ),
  pf_id uuid references public.jemaat (id) on delete set null,
  laki_laki int,
  perempuan int,
  unique (item_id, kelompok)
);

alter table public.peribadahan_smka_kelompok enable row level security;

create policy "peribadahan_smka_kelompok_select" on public.peribadahan_smka_kelompok
  for select using (true);

create policy "peribadahan_smka_kelompok_write" on public.peribadahan_smka_kelompok
  for all
  using (public.has_permission(auth.uid(), 'warta', 'update'))
  with check (public.has_permission(auth.uid(), 'warta', 'update'));
