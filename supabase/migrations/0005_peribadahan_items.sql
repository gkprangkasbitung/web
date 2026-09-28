-- Reworks Bidang Peribadahan from "one always-current row per fixed
-- category" into a dynamic, per-date list, and turns Tempat/Petugas into
-- proper master data instead of free text:
--   - peribadahan_categories: plain lookup for the "Jenis" dropdown.
--   - tempat: manageable list of locations (own admin page).
--   - jemaat: manageable list of congregation members, each optionally
--     tagged with a label/role (Pendeta, Majelis Jemaat, ...) so the
--     Petugas dropdown can be grouped by label.
--   - peribadahan_items: one row per (category, tanggal, label), pointing
--     at tempat/jemaat by id. Hari is a fixed 7-value list (checked at the
--     DB level); Jam is a real `time` value (picked via a native time
--     input, so any minute is allowed, e.g. 04:34).
--
-- The standalone /admin/peribadahan page and the Peribadahan section inside
-- a warta both read/write this same table filtered by tanggal (matching
-- warta.tanggal_kebaktian), so the two stay in sync automatically without
-- any extra sync logic.

alter table public.peribadahan_categories
  drop column if exists hari,
  drop column if exists jam,
  drop column if exists tempat,
  drop column if exists petugas;

create table public.tempat (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  keterangan text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.jemaat (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  label text,
  created_at timestamptz not null default now()
);

create index jemaat_label_idx on public.jemaat (label);

create table public.peribadahan_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.peribadahan_categories (id) on delete restrict,
  tanggal date not null,
  label text,
  hari text check (
    hari is null or hari in ('Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu')
  ),
  jam time,
  tempat_id uuid references public.tempat (id) on delete set null,
  petugas_id uuid references public.jemaat (id) on delete set null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index peribadahan_items_tanggal_idx on public.peribadahan_items (tanggal);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.tempat enable row level security;
alter table public.jemaat enable row level security;
alter table public.peribadahan_items enable row level security;

-- Public read (names/locations are shown in the printed/public bulletin),
-- writes gated behind warta:update - same live-shared model as everything
-- else in this feature.
create policy "tempat_select" on public.tempat
  for select using (true);

create policy "tempat_write" on public.tempat
  for all
  using (public.has_permission(auth.uid(), 'warta', 'update'))
  with check (public.has_permission(auth.uid(), 'warta', 'update'));

create policy "jemaat_select" on public.jemaat
  for select using (true);

create policy "jemaat_write" on public.jemaat
  for all
  using (public.has_permission(auth.uid(), 'warta', 'update'))
  with check (public.has_permission(auth.uid(), 'warta', 'update'));

create policy "peribadahan_items_select" on public.peribadahan_items
  for select using (true);

create policy "peribadahan_items_write" on public.peribadahan_items
  for all
  using (public.has_permission(auth.uid(), 'warta', 'update'))
  with check (public.has_permission(auth.uid(), 'warta', 'update'));
