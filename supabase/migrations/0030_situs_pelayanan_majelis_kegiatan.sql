-- Stage 11b: Pelayanan, Majelis, Kegiatan (brief §14.2-14.4).
--
-- Same `situs` permission as every other Konten Situs module (0029), with
-- the mapping given for this stage: read -> situs:read, every write
-- (including add and reorder) -> situs:update, delete -> situs:delete.
-- No new permission rows are needed.
--
-- 1. pelayanan: reorderable cards (like litbang_categories), icon is a fixed
--    key, not a photo.
-- 2. majelis: reorderable cards with an optional photo. Free text, not
--    linked to jemaat.
-- 3. kegiatan: a plain table (brief §9.2), draft/published, with an optional
--    photo.
-- 4. situs_referenced_photo_paths() (0029) is extended to include majelis
--    and kegiatan photos.

-- ---------------------------------------------------------------------------
-- 1. pelayanan
-- ---------------------------------------------------------------------------

create table public.pelayanan (
  id uuid primary key default gen_random_uuid(),
  nama text not null constraint pelayanan_nama_check check (btrim(nama) <> '' and char_length(nama) <= 200),
  deskripsi text constraint pelayanan_deskripsi_check check (deskripsi is null or (btrim(deskripsi) <> '' and char_length(deskripsi) <= 2000)),
  jadwal text constraint pelayanan_jadwal_check check (jadwal is null or (btrim(jadwal) <> '' and char_length(jadwal) <= 300)),
  -- A fixed list of icon keys (kept in sync with lib/pelayanan-icons.ts); the
  -- server stores the key only, never an SVG (brief §14.2).
  icon text not null constraint pelayanan_icon_check check (
    icon = any (array[
      'HeartHandshake', 'Users', 'GraduationCap', 'BookOpen', 'Music2',
      'Baby', 'HandHeart', 'Mic2', 'Coffee', 'UsersRound'
    ])
  ),
  aktif boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.pelayanan is 'Reorderable ministry cards on Beranda (brief §14.2), same pattern as litbang_categories.';

create or replace function public.reorder_pelayanan(p_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ids uuid[] := coalesce(p_ids, '{}');
begin
  if not public.has_permission(auth.uid(), 'situs', 'update') then
    raise exception using errcode = '42501', message = 'Kamu tidak punya akses untuk tindakan ini.';
  end if;
  if (select count(distinct x.id) from unnest(v_ids) as x (id)) <> cardinality(v_ids)
    or (select count(*) from public.pelayanan) <> cardinality(v_ids)
    or exists (
      select 1 from unnest(v_ids) as x (id)
      where not exists (select 1 from public.pelayanan p where p.id = x.id)
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Daftar pelayanan sudah berubah. Muat ulang halaman lalu coba lagi.';
  end if;

  update public.pelayanan p
  set sort_order = o.ord - 1
  from unnest(v_ids) with ordinality as o (id, ord)
  where p.id = o.id
    and p.sort_order is distinct from o.ord - 1;
end;
$$;

revoke all on function public.reorder_pelayanan(uuid[]) from public, anon;
grant execute on function public.reorder_pelayanan(uuid[]) to authenticated;

alter table public.pelayanan enable row level security;
revoke all on public.pelayanan from anon;

create policy pelayanan_select on public.pelayanan
  for select to authenticated
  using (public.has_permission(auth.uid(), 'situs', 'read'));
create policy pelayanan_insert on public.pelayanan
  for insert to authenticated
  with check (public.has_permission(auth.uid(), 'situs', 'update'));
create policy pelayanan_update on public.pelayanan
  for update to authenticated
  using (public.has_permission(auth.uid(), 'situs', 'update'))
  with check (public.has_permission(auth.uid(), 'situs', 'update'));
create policy pelayanan_delete on public.pelayanan
  for delete to authenticated
  using (public.has_permission(auth.uid(), 'situs', 'delete'));

-- anon reads only active rows, and only the public columns (the app's own
-- query never selects created_at/sort_order beyond ordering by it).
grant select on public.pelayanan to anon;
create policy pelayanan_anon_select on public.pelayanan
  for select to anon
  using (aktif = true);

-- ---------------------------------------------------------------------------
-- 2. majelis
-- ---------------------------------------------------------------------------

create table public.majelis (
  id uuid primary key default gen_random_uuid(),
  nama text not null constraint majelis_nama_check check (btrim(nama) <> '' and char_length(nama) <= 200),
  jabatan text not null constraint majelis_jabatan_check check (btrim(jabatan) <> '' and char_length(jabatan) <= 200),
  foto_path text,
  foto_alt text,
  aktif boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),

  constraint majelis_foto_check check (
    (foto_path is null) = (foto_alt is null)
    and private.is_situs_photo_path(foto_path)
    and btrim(foto_alt) <> '' and char_length(foto_alt) <= 300
  )
);

comment on table public.majelis is 'Reorderable pastor/majelis cards on Tentang Kami (brief §14.3). Free text, not linked to jemaat.';

create trigger enforce_situs_photo_paths
  before insert or update on public.majelis
  for each row execute function private.enforce_situs_photo_paths('foto_path');

create or replace function public.reorder_majelis(p_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ids uuid[] := coalesce(p_ids, '{}');
begin
  if not public.has_permission(auth.uid(), 'situs', 'update') then
    raise exception using errcode = '42501', message = 'Kamu tidak punya akses untuk tindakan ini.';
  end if;
  if (select count(distinct x.id) from unnest(v_ids) as x (id)) <> cardinality(v_ids)
    or (select count(*) from public.majelis) <> cardinality(v_ids)
    or exists (
      select 1 from unnest(v_ids) as x (id)
      where not exists (select 1 from public.majelis m where m.id = x.id)
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Daftar majelis sudah berubah. Muat ulang halaman lalu coba lagi.';
  end if;

  update public.majelis m
  set sort_order = o.ord - 1
  from unnest(v_ids) with ordinality as o (id, ord)
  where m.id = o.id
    and m.sort_order is distinct from o.ord - 1;
end;
$$;

revoke all on function public.reorder_majelis(uuid[]) from public, anon;
grant execute on function public.reorder_majelis(uuid[]) to authenticated;

alter table public.majelis enable row level security;
revoke all on public.majelis from anon;

create policy majelis_select on public.majelis
  for select to authenticated
  using (public.has_permission(auth.uid(), 'situs', 'read'));
create policy majelis_insert on public.majelis
  for insert to authenticated
  with check (public.has_permission(auth.uid(), 'situs', 'update'));
create policy majelis_update on public.majelis
  for update to authenticated
  using (public.has_permission(auth.uid(), 'situs', 'update'))
  with check (public.has_permission(auth.uid(), 'situs', 'update'));
create policy majelis_delete on public.majelis
  for delete to authenticated
  using (public.has_permission(auth.uid(), 'situs', 'delete'));

grant select on public.majelis to anon;
create policy majelis_anon_select on public.majelis
  for select to anon
  using (aktif = true);

-- ---------------------------------------------------------------------------
-- 3. kegiatan
-- ---------------------------------------------------------------------------

create table public.kegiatan (
  id uuid primary key default gen_random_uuid(),
  judul text not null constraint kegiatan_judul_check check (btrim(judul) <> '' and char_length(judul) <= 200),
  tanggal date not null,
  waktu time,
  tempat text constraint kegiatan_tempat_check check (tempat is null or (btrim(tempat) <> '' and char_length(tempat) <= 200)),
  deskripsi text constraint kegiatan_deskripsi_check check (deskripsi is null or (btrim(deskripsi) <> '' and char_length(deskripsi) <= 2000)),
  foto_path text,
  foto_alt text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint kegiatan_foto_check check (
    (foto_path is null) = (foto_alt is null)
    and private.is_situs_photo_path(foto_path)
    and btrim(foto_alt) <> '' and char_length(foto_alt) <= 300
  )
);

comment on table public.kegiatan is 'Table-pattern list (brief §9.2, §14.4): draft/published, optional photo.';

create trigger touch_updated_at
  before update on public.kegiatan
  for each row execute function private.touch_updated_at();

create trigger enforce_situs_photo_paths
  before insert or update on public.kegiatan
  for each row execute function private.enforce_situs_photo_paths('foto_path');

alter table public.kegiatan enable row level security;
revoke all on public.kegiatan from anon;

create policy kegiatan_select on public.kegiatan
  for select to authenticated
  using (public.has_permission(auth.uid(), 'situs', 'read'));
create policy kegiatan_insert on public.kegiatan
  for insert to authenticated
  with check (public.has_permission(auth.uid(), 'situs', 'update'));
create policy kegiatan_update on public.kegiatan
  for update to authenticated
  using (public.has_permission(auth.uid(), 'situs', 'update'))
  with check (public.has_permission(auth.uid(), 'situs', 'update'));
create policy kegiatan_delete on public.kegiatan
  for delete to authenticated
  using (public.has_permission(auth.uid(), 'situs', 'delete'));

-- anon reads only published rows; the beranda loader further filters
-- tanggal >= today and limits to 3 in the app query.
grant select on public.kegiatan to anon;
create policy kegiatan_anon_select on public.kegiatan
  for select to anon
  using (status = 'published');

-- ---------------------------------------------------------------------------
-- 4. Referenced photo paths (0029's function, extended)
-- ---------------------------------------------------------------------------

create or replace function public.situs_referenced_photo_paths()
returns setof text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_permission(auth.uid(), 'situs', 'update') then
    raise exception using errcode = '42501', message = 'Kamu tidak punya akses untuk tindakan ini.';
  end if;
  return query
    select x.path
    from public.profil_gereja p
    cross join lateral unnest(array[p.hero_foto_path, p.sambutan_foto_path, p.sejarah_foto_path]) as x (path)
    where x.path is not null
    union
    select r.qris_foto_path from public.profil_gereja_rekening r where r.qris_foto_path is not null
    union
    select m.foto_path from public.majelis m where m.foto_path is not null
    union
    select k.foto_path from public.kegiatan k where k.foto_path is not null;
end;
$$;
