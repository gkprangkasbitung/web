-- Warta (weekly church bulletin) schema.
--
-- Three data patterns:
--   1. warta itself: fixed fields (Informasi + Renungan), one row per issue.
--   2. peribadahan_categories / sarana_dana_items: "live" shared reference
--      data. Editable from their own admin page OR inline from the warta
--      form - both write to the same rows, so there is exactly one current
--      value, shown by every warta (including already-published ones).
--   3. litbang_categories (master template) + warta_litbang_items (per-issue
--      snapshot): a new warta copies the current template values into its
--      own independent rows, which can then be edited without affecting the
--      template or any other warta.

create table public.warta (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  status text not null default 'draft' check (status in ('draft', 'published')),
  tanggal_kebaktian date not null,
  judul_kebaktian text not null,
  tema_kebaktian text,
  renungan_judul text,
  renungan_kitab text,
  renungan_isi text,
  renungan_sumber text,
  created_by uuid references auth.users (id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index warta_status_tanggal_idx on public.warta (status, tanggal_kebaktian desc);

-- Live-shared: Bidang Peribadahan (9 fixed categories).
create table public.peribadahan_categories (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  hari text,
  jam text,
  tempat text,
  petugas text,
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);

-- Live-shared: Bidang Sarana dan Dana (3 fixed items).
create table public.sarana_dana_items (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  nominal numeric(14, 2) not null default 0,
  keterangan text,
  updated_at timestamptz not null default now()
);

-- Master template: Bidang Litbang (5 fixed categories). Only edited from its
-- own admin page - never shown directly on the public site.
create table public.litbang_categories (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  hari text,
  jam text,
  tempat text,
  petugas text,
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);

-- Per-warta snapshot of litbang_categories, copied at creation time and then
-- fully independent (editing one warta's rows never touches another warta's
-- rows or the template).
create table public.warta_litbang_items (
  id uuid primary key default gen_random_uuid(),
  warta_id uuid not null references public.warta (id) on delete cascade,
  litbang_category_id uuid references public.litbang_categories (id) on delete set null,
  name text not null,
  hari text,
  jam text,
  tempat text,
  petugas text,
  sort_order int not null default 0
);

create index warta_litbang_items_warta_id_idx on public.warta_litbang_items (warta_id);

-- Bidang Kesaksian dan Keesaan: dynamic, unbounded list per warta.
create table public.warta_kesaksian_items (
  id uuid primary key default gen_random_uuid(),
  warta_id uuid not null references public.warta (id) on delete cascade,
  judul text not null,
  deskripsi text,
  sort_order int not null default 0
);

create index warta_kesaksian_items_warta_id_idx on public.warta_kesaksian_items (warta_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.warta enable row level security;
alter table public.peribadahan_categories enable row level security;
alter table public.sarana_dana_items enable row level security;
alter table public.litbang_categories enable row level security;
alter table public.warta_litbang_items enable row level security;
alter table public.warta_kesaksian_items enable row level security;

-- warta: anyone can read published issues; unpublished issues need warta:read.
create policy "warta_select" on public.warta
  for select using (
    status = 'published' or public.has_permission(auth.uid(), 'warta', 'read')
  );

create policy "warta_insert" on public.warta
  for insert with check (public.has_permission(auth.uid(), 'warta', 'create'));

create policy "warta_update" on public.warta
  for update using (public.has_permission(auth.uid(), 'warta', 'update'));

create policy "warta_delete" on public.warta
  for delete using (public.has_permission(auth.uid(), 'warta', 'delete'));

-- peribadahan_categories / sarana_dana_items: public read (evergreen bulletin
-- info shown to the congregation), writes gated behind warta:update.
create policy "peribadahan_categories_select" on public.peribadahan_categories
  for select using (true);

create policy "peribadahan_categories_write" on public.peribadahan_categories
  for all
  using (public.has_permission(auth.uid(), 'warta', 'update'))
  with check (public.has_permission(auth.uid(), 'warta', 'update'));

create policy "sarana_dana_items_select" on public.sarana_dana_items
  for select using (true);

create policy "sarana_dana_items_write" on public.sarana_dana_items
  for all
  using (public.has_permission(auth.uid(), 'warta', 'update'))
  with check (public.has_permission(auth.uid(), 'warta', 'update'));

-- litbang_categories: internal template, never read directly by the public.
create policy "litbang_categories_select" on public.litbang_categories
  for select using (public.has_permission(auth.uid(), 'warta', 'read'));

create policy "litbang_categories_write" on public.litbang_categories
  for all
  using (public.has_permission(auth.uid(), 'warta', 'update'))
  with check (public.has_permission(auth.uid(), 'warta', 'update'));

-- warta_litbang_items / warta_kesaksian_items: public read only through a
-- published parent warta; writes need create (initial snapshot/add) or
-- update (later edits) on warta.
create policy "warta_litbang_items_select" on public.warta_litbang_items
  for select using (
    exists (
      select 1 from public.warta w
      where w.id = warta_id and w.status = 'published'
    )
    or public.has_permission(auth.uid(), 'warta', 'read')
  );

create policy "warta_litbang_items_write" on public.warta_litbang_items
  for all
  using (
    public.has_permission(auth.uid(), 'warta', 'update')
    or public.has_permission(auth.uid(), 'warta', 'create')
  )
  with check (
    public.has_permission(auth.uid(), 'warta', 'update')
    or public.has_permission(auth.uid(), 'warta', 'create')
  );

create policy "warta_kesaksian_items_select" on public.warta_kesaksian_items
  for select using (
    exists (
      select 1 from public.warta w
      where w.id = warta_id and w.status = 'published'
    )
    or public.has_permission(auth.uid(), 'warta', 'read')
  );

create policy "warta_kesaksian_items_write" on public.warta_kesaksian_items
  for all
  using (
    public.has_permission(auth.uid(), 'warta', 'update')
    or public.has_permission(auth.uid(), 'warta', 'create')
  )
  with check (
    public.has_permission(auth.uid(), 'warta', 'update')
    or public.has_permission(auth.uid(), 'warta', 'create')
  );
