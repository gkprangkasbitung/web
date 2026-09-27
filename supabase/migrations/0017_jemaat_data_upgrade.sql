-- Data Jemaat upgrade: family grouping (keluarga), a manual membership
-- status dropdown (replacing the old sudah_baptis/sudah_sidi booleans as
-- the source of truth - those columns are left in place, just unused by
-- the app from here on), job, member number, and pastoral care notes.

create table public.keluarga (
  id uuid primary key default gen_random_uuid(),
  nama text not null unique,
  created_at timestamptz not null default now()
);

alter table public.keluarga enable row level security;

-- Same public-read / warta:update-write model as the rest of Jemaat.
create policy "keluarga_select" on public.keluarga
  for select using (true);

create policy "keluarga_write" on public.keluarga
  for all
  using (public.has_permission(auth.uid(), 'warta', 'update'))
  with check (public.has_permission(auth.uid(), 'warta', 'update'));

alter table public.jemaat
  add column if not exists keluarga_id uuid references public.keluarga (id) on delete set null,
  add column if not exists hubungan_keluarga text,
  add column if not exists status_keanggotaan text check (
    status_keanggotaan in ('simpatisan', 'baptis_anak', 'sidi', 'anggota_penuh')
  ),
  add column if not exists pekerjaan text,
  add column if not exists nomor_anggota text unique;

create table public.jemaat_catatan_pastoral (
  id uuid primary key default gen_random_uuid(),
  jemaat_id uuid not null references public.jemaat (id) on delete cascade,
  jenis text not null,
  tanggal date not null default current_date,
  penulis_id uuid references auth.users (id) on delete set null,
  penulis_nama text,
  isi text not null,
  created_at timestamptz not null default now()
);

create index jemaat_catatan_pastoral_jemaat_idx
  on public.jemaat_catatan_pastoral (jemaat_id, tanggal desc);

alter table public.jemaat_catatan_pastoral enable row level security;

-- Pastoral notes are internal (unlike the rest of Jemaat, which is
-- public-readable for the printed/public bulletin).
create policy "jemaat_catatan_pastoral_select" on public.jemaat_catatan_pastoral
  for select using (public.has_permission(auth.uid(), 'warta', 'read'));

create policy "jemaat_catatan_pastoral_write" on public.jemaat_catatan_pastoral
  for all
  using (public.has_permission(auth.uid(), 'warta', 'update'))
  with check (public.has_permission(auth.uid(), 'warta', 'update'));
