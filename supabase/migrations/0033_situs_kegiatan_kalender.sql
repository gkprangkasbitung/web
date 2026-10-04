-- Stage 11e: Kalender Kegiatan (brief §14.4, calendar edition).
--
-- Kegiatan moves from a single tanggal/waktu row to a date range
-- (tanggal_mulai/tanggal_selesai, waktu_mulai/waktu_selesai) with a
-- category, a Google Maps link, registration info, an immutable slug, and
-- an optional organizing komisi. anon loses all direct table access to
-- kegiatan (and kategori_kegiatan never had any) — the public calendar,
-- detail page, and Beranda's "Kegiatan mendatang" are all served through
-- three new security-definer functions.
--
-- 1. private.current_date_jakarta(): shared "today" helper (Asia/Jakarta),
--    same reasoning/shape as 0031's private.current_year_jakarta().
-- 2. kategori_kegiatan (master data): nama + warna (a key from the fixed
--    code palette, lib/kegiatan-kategori.ts — never a free hex), sort_order.
--    Seeded with the brief's 5 categories.
-- 3. kegiatan: add tanggal_mulai/tanggal_selesai, waktu_mulai/waktu_selesai,
--    kategori_id, maps_url, info_pendaftaran, penyelenggara_komisi_id, slug.
--    Backfill existing rows (tanggal_selesai = tanggal_mulai, kategori =
--    the lowest-sort_order seed row, slug from judul with a numeric suffix
--    on collision), then lock the new columns down, drop the old ones, and
--    revoke anon's direct read.
-- 4. Public functions: kegiatan_bulan(bulan), kegiatan_detail(slug),
--    kegiatan_mendatang(limit, exclude) — the last one is new beyond the
--    brief's own two, needed because anon can no longer select the table
--    directly, and both Beranda and the detail page's "Kegiatan lainnya"
--    need the same "next N published, tanggal_selesai >= today" query.
--
-- situs_referenced_photo_paths() (0029-0032) already covers kegiatan's
-- foto_path and needs no change.

-- ---------------------------------------------------------------------------
-- 1. private.current_date_jakarta()
-- ---------------------------------------------------------------------------

create or replace function private.current_date_jakarta()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Jakarta')::date;
$$;

-- ---------------------------------------------------------------------------
-- 2. kategori_kegiatan
-- ---------------------------------------------------------------------------

create table public.kategori_kegiatan (
  id uuid primary key default gen_random_uuid(),
  nama text not null constraint kategori_kegiatan_nama_check check (btrim(nama) <> '' and char_length(nama) <= 100),
  -- A fixed list of palette keys (kept in sync with lib/kegiatan-kategori.ts
  -- by hand, same convention as pelayanan's icon keys): the server stores
  -- the key only, never a free hex value (brief §14.4).
  warna text not null constraint kategori_kegiatan_warna_check check (
    warna = any (array['hijau', 'oranye', 'biru', 'merah', 'abu', 'kuning', 'ungu', 'teal'])
  ),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.kategori_kegiatan is
  'Master kategori kegiatan (brief §14.4): nama + a palette key. No manual reorder (same shape as jabatan_komisi); new rows append at max(sort_order) + 1.';

create unique index kategori_kegiatan_nama_lower_idx on public.kategori_kegiatan (lower(nama));

insert into public.kategori_kegiatan (nama, warna, sort_order) values
  ('Ibadah khusus', 'hijau', 0),
  ('Pemuda & Remaja', 'oranye', 1),
  ('Anak', 'biru', 2),
  ('Diakonia', 'merah', 3),
  ('Rapat & organisasi', 'abu', 4);

alter table public.kategori_kegiatan enable row level security;
revoke all on public.kategori_kegiatan from anon;

create policy kategori_kegiatan_select on public.kategori_kegiatan
  for select to authenticated
  using (public.has_permission(auth.uid(), 'situs', 'read'));
create policy kategori_kegiatan_insert on public.kategori_kegiatan
  for insert to authenticated
  with check (public.has_permission(auth.uid(), 'situs', 'update'));
create policy kategori_kegiatan_update on public.kategori_kegiatan
  for update to authenticated
  using (public.has_permission(auth.uid(), 'situs', 'update'))
  with check (public.has_permission(auth.uid(), 'situs', 'update'));
create policy kategori_kegiatan_delete on public.kategori_kegiatan
  for delete to authenticated
  using (public.has_permission(auth.uid(), 'situs', 'delete'));

-- ---------------------------------------------------------------------------
-- 3. kegiatan: calendar edition
-- ---------------------------------------------------------------------------

alter table public.kegiatan
  add column tanggal_mulai date,
  add column tanggal_selesai date,
  add column waktu_mulai time,
  add column waktu_selesai time,
  add column maps_url text,
  add column info_pendaftaran text,
  add column kategori_id uuid,
  add column penyelenggara_komisi_id uuid references public.komisi (id) on delete set null,
  add column slug text;

-- Migrate existing rows: tanggal_selesai = tanggal_mulai, waktu -> waktu_mulai,
-- kategori = the lowest-sort_order seed row ("Ibadah khusus"), and a unique
-- slug derived from judul (ASCII-only; the project's own slugify() in
-- lib/warta.ts additionally strips accents, which this one-time backfill
-- doesn't need to match exactly since no real titles exist yet).
do $$
declare
  v_default_kategori_id uuid;
  v_row record;
  v_base text;
  v_slug text;
  v_suffix int;
begin
  select id into v_default_kategori_id from public.kategori_kegiatan order by sort_order limit 1;

  update public.kegiatan
  set tanggal_mulai = tanggal,
      tanggal_selesai = tanggal,
      waktu_mulai = waktu,
      kategori_id = v_default_kategori_id
  where tanggal_mulai is null;

  for v_row in select id, judul from public.kegiatan where slug is null order by created_at, id loop
    v_base := lower(regexp_replace(v_row.judul, '[^a-zA-Z0-9]+', '-', 'g'));
    v_base := trim(both '-' from v_base);
    if v_base = '' then
      v_base := 'kegiatan';
    end if;
    v_slug := v_base;
    v_suffix := 1;
    while exists (select 1 from public.kegiatan where slug = v_slug and id <> v_row.id) loop
      v_suffix := v_suffix + 1;
      v_slug := v_base || '-' || v_suffix;
    end loop;
    update public.kegiatan set slug = v_slug where id = v_row.id;
  end loop;
end;
$$;

alter table public.kegiatan
  alter column tanggal_mulai set not null,
  alter column tanggal_selesai set not null,
  alter column kategori_id set not null,
  alter column slug set not null;

alter table public.kegiatan
  add constraint kegiatan_slug_format_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  add constraint kegiatan_slug_key unique (slug),
  add constraint kegiatan_tanggal_range_check check (
    tanggal_selesai >= tanggal_mulai and tanggal_selesai <= tanggal_mulai + 30
  ),
  add constraint kegiatan_waktu_order_check check (
    tanggal_mulai <> tanggal_selesai or waktu_mulai is null or waktu_selesai is null or waktu_selesai > waktu_mulai
  ),
  add constraint kegiatan_maps_url_check check (
    maps_url is null or (
      char_length(maps_url) <= 2000
      and maps_url ~ '^https://((www\.|maps\.)?google\.com/maps([/?#][^[:space:][:cntrl:]"<>\\]*)?|maps\.app\.goo\.gl/[^[:space:][:cntrl:]"<>\\]+)$'
    )
  ),
  add constraint kegiatan_info_pendaftaran_check check (
    info_pendaftaran is null or (btrim(info_pendaftaran) <> '' and char_length(info_pendaftaran) <= 2000)
  ),
  add constraint kegiatan_kategori_id_fkey foreign key (kategori_id) references public.kategori_kegiatan (id) on delete restrict;

alter table public.kegiatan
  drop column tanggal,
  drop column waktu;

comment on table public.kegiatan is
  'Calendar events (brief §14.4): a date range, optional time range, category, and an immutable slug.';

-- Slug never changes after creation (brief §14.4), whatever writes it: the
-- app (lib/kegiatan-routes.ts), a future RPC, or a direct REST PATCH.
create or replace function private.enforce_kegiatan_slug_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.slug is distinct from old.slug then
    raise exception using errcode = '22023', message = 'Slug kegiatan tidak bisa diubah.';
  end if;
  return new;
end;
$$;

create trigger enforce_kegiatan_slug_immutable
  before update on public.kegiatan
  for each row execute function private.enforce_kegiatan_slug_immutable();

-- anon no longer reads kegiatan directly (brief §14.4): only through
-- kegiatan_bulan/kegiatan_detail/kegiatan_mendatang below.
drop policy if exists kegiatan_anon_select on public.kegiatan;
revoke select on public.kegiatan from anon;

-- ---------------------------------------------------------------------------
-- 4. Public functions
-- ---------------------------------------------------------------------------

-- Calendar grid / list view: published events overlapping the given month.
-- A malformed p_bulan, or one more than 24 months from the current month in
-- either direction, returns an empty set rather than raising (brief §14.4,
-- so a bad ?bulan= in the URL never 500s).
create or replace function public.kegiatan_bulan(p_bulan text)
returns table (
  id uuid,
  judul text,
  slug text,
  tanggal_mulai date,
  tanggal_selesai date,
  waktu_mulai time,
  waktu_selesai time,
  tempat text,
  kategori_id uuid,
  kategori_nama text,
  kategori_warna text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_start date;
  v_end date;
  v_this_month date := date_trunc('month', private.current_date_jakarta())::date;
begin
  if p_bulan is null or p_bulan !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    return;
  end if;

  v_start := (p_bulan || '-01')::date;
  if v_start < (v_this_month - interval '24 months')::date or v_start > (v_this_month + interval '24 months')::date then
    return;
  end if;
  v_end := (v_start + interval '1 month' - interval '1 day')::date;

  return query
    select k.id, k.judul, k.slug, k.tanggal_mulai, k.tanggal_selesai, k.waktu_mulai, k.waktu_selesai,
           k.tempat, k.kategori_id, kk.nama, kk.warna
    from public.kegiatan k
    join public.kategori_kegiatan kk on kk.id = k.kategori_id
    where k.status = 'published'
      and k.tanggal_mulai <= v_end
      and k.tanggal_selesai >= v_start
    order by k.tanggal_mulai, k.waktu_mulai nulls first, k.judul;
end;
$$;

revoke all on function public.kegiatan_bulan(text) from public, anon, authenticated, service_role;
grant execute on function public.kegiatan_bulan(text) to anon, authenticated;

-- Detail page: only a published row, with the category and (when set) the
-- organizing komisi's name. The komisi's own name shows regardless of its
-- `tampil` flag (picking an organizer is a deliberate, independent admin
-- choice, same reasoning as Sambutan's pendeta pick in 0031); the slug is
-- included only when that komisi is itself `tampil`, so the public page
-- links to it only when it actually resolves.
create or replace function public.kegiatan_detail(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', k.id,
    'judul', k.judul,
    'slug', k.slug,
    'kategori_nama', kk.nama,
    'kategori_warna', kk.warna,
    'tanggal_mulai', k.tanggal_mulai,
    'tanggal_selesai', k.tanggal_selesai,
    'waktu_mulai', k.waktu_mulai,
    'waktu_selesai', k.waktu_selesai,
    'tempat', k.tempat,
    'maps_url', k.maps_url,
    'deskripsi', k.deskripsi,
    'info_pendaftaran', k.info_pendaftaran,
    'foto_path', k.foto_path,
    'foto_alt', k.foto_alt,
    'penyelenggara_komisi_nama', pk.nama,
    'penyelenggara_komisi_slug', case when pk.tampil then pk.slug else null end
  )
  from public.kegiatan k
  join public.kategori_kegiatan kk on kk.id = k.kategori_id
  left join public.komisi pk on pk.id = k.penyelenggara_komisi_id
  where k.slug = p_slug and k.status = 'published';
$$;

revoke all on function public.kegiatan_detail(text) from public, anon, authenticated, service_role;
grant execute on function public.kegiatan_detail(text) to anon, authenticated;

-- Beranda's "Kegiatan mendatang" and the detail page's "Kegiatan lainnya":
-- the next p_limit published events with tanggal_selesai >= today (so an
-- event already under way still shows), optionally excluding one event.
create or replace function public.kegiatan_mendatang(p_limit int default 3, p_exclude_id uuid default null)
returns table (
  id uuid,
  judul text,
  slug text,
  tanggal_mulai date,
  tanggal_selesai date,
  waktu_mulai time,
  waktu_selesai time,
  tempat text,
  foto_path text,
  foto_alt text,
  kategori_nama text,
  kategori_warna text
)
language sql
stable
security definer
set search_path = ''
as $$
  select k.id, k.judul, k.slug, k.tanggal_mulai, k.tanggal_selesai, k.waktu_mulai, k.waktu_selesai,
         k.tempat, k.foto_path, k.foto_alt, kk.nama, kk.warna
  from public.kegiatan k
  join public.kategori_kegiatan kk on kk.id = k.kategori_id
  where k.status = 'published'
    and k.tanggal_selesai >= private.current_date_jakarta()
    and (p_exclude_id is null or k.id <> p_exclude_id)
  order by k.tanggal_mulai, k.id
  limit greatest(coalesce(p_limit, 3), 0);
$$;

revoke all on function public.kegiatan_mendatang(int, uuid) from public, anon, authenticated, service_role;
grant execute on function public.kegiatan_mendatang(int, uuid) to anon, authenticated;
