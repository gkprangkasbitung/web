-- Stage 11a: site content permissions, the `situs` photo bucket, and Profil
-- Gereja (brief §14, §14.1, §14.5).
--
-- 1. Permissions: `situs:{create,read,update,delete}` and
--    `situs_rekening:update`, seeded per brief §14. The permission editor's
--    save (set_role_ui_permissions, 0028) now covers both resources.
-- 2. Bucket `situs`: public read by URL. There is deliberately NO policy on
--    storage.objects for it, so anon and authenticated can't insert, update,
--    delete, or list. Only the Next.js server writes, with the service role,
--    after checking situs:update and re-encoding the image (lib/situs-photos.ts).
-- 3. profil_gereja (singleton, id = 1): every section except Persembahan.
-- 4. profil_gereja_rekening (singleton, id = 1): Persembahan, in its own
--    table so RLS alone limits writes to situs_rekening:update.
-- 5. profil_gereja_linimasa: the ordered timeline, plus an atomic reorder RPC.
-- 6. Photo paths: format checked, and a referenced path must exist in the
--    bucket, so no write path (REST included) can store a broken reference.
-- 7. public_profil_gereja(): the only thing anon can read, limited to what
--    the public site shows.
-- 8. situs_referenced_photo_paths(): what the server may never delete.

-- ---------------------------------------------------------------------------
-- 1. Permissions
-- ---------------------------------------------------------------------------

insert into public.permissions (resource, action, description)
select 'situs', action, 'situs:' || action
from unnest(array['create', 'read', 'update', 'delete']) as action
union all
select 'situs_rekening', 'update', 'situs_rekening:update'
on conflict (resource, action) do nothing;

-- super_admin and admin: all of situs plus situs_rekening:update.
-- editor: situs create/read/update. viewer: situs read.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on (
  (r.name in ('super_admin', 'admin') and p.resource in ('situs', 'situs_rekening'))
  or (r.name = 'editor' and p.resource = 'situs' and p.action in ('create', 'read', 'update'))
  or (r.name = 'viewer' and p.resource = 'situs' and p.action = 'read')
)
on conflict do nothing;

-- Same function as 0028, with situs and situs_rekening added to the scope.
create or replace function public.set_role_ui_permissions(p_role_id uuid, p_permission_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_scope constant text[] := array['warta', 'users', 'roles', 'activity_log', 'situs', 'situs_rekening'];
  v_ids uuid[] := coalesce(p_permission_ids, '{}');
begin
  if not public.has_permission(auth.uid(), 'roles', 'update') then
    raise exception using errcode = '42501', message = 'Kamu tidak punya akses untuk tindakan ini.';
  end if;
  if not exists (select 1 from public.roles where id = p_role_id) then
    raise exception using errcode = 'P0002', message = 'Role tidak ditemukan.';
  end if;
  if exists (
    select 1 from unnest(v_ids) as x (id)
    where x.id is null
      or not exists (select 1 from public.permissions p where p.id = x.id and p.resource = any (v_scope))
  ) then
    raise exception using errcode = '22023', message = 'Permission tidak dikenal.';
  end if;

  insert into public.role_permissions (role_id, permission_id)
  select distinct p_role_id, x.id
  from unnest(v_ids) as x (id)
  on conflict do nothing;

  delete from public.role_permissions rp
  using public.permissions p
  where rp.role_id = p_role_id
    and p.id = rp.permission_id
    and p.resource = any (v_scope)
    and rp.permission_id <> all (v_ids);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Bucket
-- ---------------------------------------------------------------------------

-- The size and type limits repeat the server's own checks (defense in depth).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('situs', 'situs', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Shared helpers (private schema: not exposed through the API)
-- ---------------------------------------------------------------------------

-- `{folder}/{uuid v4}.{jpg|png|webp}`: the only names the server generates.
create or replace function private.is_situs_photo_path(p_path text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_path ~ '^[a-z]+/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$';
$$;

-- Misi: at most 20 lines, each non-blank and at most 500 characters.
create or replace function private.is_valid_misi(p_misi text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(cardinality(p_misi), 0) <= 20
    and not exists (
      select 1 from unnest(p_misi) as m (line)
      where m.line is null or btrim(m.line) = '' or char_length(m.line) > 500
    );
$$;

-- Before insert/update on a table with photo columns (names in TG_ARGV): a
-- path that changes must name an object that exists in the `situs` bucket.
-- A malformed path is left to the table's CHECK constraint (23514).
-- Security definer: storage.objects has no policy, so the caller can't see it.
create or replace function private.enforce_situs_photo_paths()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_column text;
  v_new text;
  v_old text;
begin
  foreach v_column in array tg_argv loop
    v_new := to_jsonb(new) ->> v_column;
    v_old := case when tg_op = 'UPDATE' then to_jsonb(old) ->> v_column end;
    if v_new is not null and v_new is distinct from v_old and private.is_situs_photo_path(v_new) and not exists (
      select 1 from storage.objects o where o.bucket_id = 'situs' and o.name = v_new
    ) then
      raise exception using errcode = '22023', message = 'Foto tidak ditemukan di penyimpanan.';
    end if;
  end loop;
  return new;
end;
$$;

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. profil_gereja
-- ---------------------------------------------------------------------------

create table public.profil_gereja (
  id smallint primary key default 1,
  -- Beranda
  hero_judul text,
  hero_subjudul text,
  hero_foto_path text,
  hero_foto_alt text,
  -- Sambutan
  sambutan_teks text,
  sambutan_nama text,
  sambutan_jabatan text,
  sambutan_foto_path text,
  sambutan_foto_alt text,
  -- Tentang
  sejarah text,
  visi text,
  misi text[] not null default '{}',
  sejarah_foto_path text,
  sejarah_foto_alt text,
  -- Kontak
  alamat text,
  telepon text,
  email text,
  jam_sekretariat text,
  maps_url text,
  -- Sosial media
  instagram_url text,
  youtube_url text,
  facebook_url text,
  updated_at timestamptz not null default now(),

  constraint profil_gereja_singleton check (id = 1),

  -- Text: blank is stored as null, never as ''.
  constraint profil_gereja_hero_judul_check check (btrim(hero_judul) <> '' and char_length(hero_judul) <= 120),
  constraint profil_gereja_hero_subjudul_check check (btrim(hero_subjudul) <> '' and char_length(hero_subjudul) <= 300),
  constraint profil_gereja_sambutan_teks_check check (btrim(sambutan_teks) <> '' and char_length(sambutan_teks) <= 2000),
  constraint profil_gereja_sambutan_nama_check check (btrim(sambutan_nama) <> '' and char_length(sambutan_nama) <= 120),
  constraint profil_gereja_sambutan_jabatan_check check (btrim(sambutan_jabatan) <> '' and char_length(sambutan_jabatan) <= 120),
  constraint profil_gereja_sejarah_check check (btrim(sejarah) <> '' and char_length(sejarah) <= 10000),
  constraint profil_gereja_visi_check check (btrim(visi) <> '' and char_length(visi) <= 1000),
  constraint profil_gereja_misi_check check (private.is_valid_misi(misi)),
  constraint profil_gereja_alamat_check check (btrim(alamat) <> '' and char_length(alamat) <= 500),
  constraint profil_gereja_jam_sekretariat_check check (btrim(jam_sekretariat) <> '' and char_length(jam_sekretariat) <= 200),

  -- Digits only, used for a wa.me link (brief §14.1).
  constraint profil_gereja_telepon_check check (telepon ~ '^[0-9]{8,15}$'),
  constraint profil_gereja_email_check check (char_length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),

  -- https only, host fixed per platform: the host must be followed by "/",
  -- so "instagram.com.evil.com", "instagram.com@evil.com", and ports fail.
  constraint profil_gereja_maps_url_check check (
    char_length(maps_url) <= 2000
    and maps_url ~ '^https://((www\.|maps\.)?google\.com/maps([/?#][^[:space:][:cntrl:]"<>\\]*)?|maps\.app\.goo\.gl/[^[:space:][:cntrl:]"<>\\]+)$'
  ),
  constraint profil_gereja_instagram_url_check check (
    char_length(instagram_url) <= 500
    and instagram_url ~ '^https://(www\.)?instagram\.com/[^[:space:][:cntrl:]"<>\\]+$'
  ),
  constraint profil_gereja_youtube_url_check check (
    char_length(youtube_url) <= 500
    and youtube_url ~ '^https://(www\.|m\.)?youtube\.com/[^[:space:][:cntrl:]"<>\\]+$'
  ),
  constraint profil_gereja_facebook_url_check check (
    char_length(facebook_url) <= 500
    and facebook_url ~ '^https://(www\.|m\.|web\.)?facebook\.com/[^[:space:][:cntrl:]"<>\\]+$'
  ),

  -- Photos: a path and its alt text come together; alt text is required (§14.5).
  constraint profil_gereja_hero_foto_check check (
    (hero_foto_path is null) = (hero_foto_alt is null)
    and private.is_situs_photo_path(hero_foto_path)
    and btrim(hero_foto_alt) <> '' and char_length(hero_foto_alt) <= 300
  ),
  constraint profil_gereja_sambutan_foto_check check (
    (sambutan_foto_path is null) = (sambutan_foto_alt is null)
    and private.is_situs_photo_path(sambutan_foto_path)
    and btrim(sambutan_foto_alt) <> '' and char_length(sambutan_foto_alt) <= 300
  ),
  constraint profil_gereja_sejarah_foto_check check (
    (sejarah_foto_path is null) = (sejarah_foto_alt is null)
    and private.is_situs_photo_path(sejarah_foto_path)
    and btrim(sejarah_foto_alt) <> '' and char_length(sejarah_foto_alt) <= 300
  )
);

comment on table public.profil_gereja is
  'Profil Gereja (brief §14.1), a single row with id = 1. Persembahan lives in profil_gereja_rekening.';

insert into public.profil_gereja (id) values (1);

create trigger touch_updated_at
  before update on public.profil_gereja
  for each row execute function private.touch_updated_at();

create trigger enforce_situs_photo_paths
  before insert or update on public.profil_gereja
  for each row execute function private.enforce_situs_photo_paths('hero_foto_path', 'sambutan_foto_path', 'sejarah_foto_path');

-- ---------------------------------------------------------------------------
-- 4. profil_gereja_rekening
-- ---------------------------------------------------------------------------

create table public.profil_gereja_rekening (
  id smallint primary key default 1,
  nama_bank text,
  nomor_rekening text,
  atas_nama text,
  qris_foto_path text,
  qris_foto_alt text,
  updated_at timestamptz not null default now(),

  constraint profil_gereja_rekening_singleton check (id = 1),
  -- All three account fields, or none.
  constraint profil_gereja_rekening_lengkap_check check (
    (nama_bank is null) = (nomor_rekening is null) and (nomor_rekening is null) = (atas_nama is null)
  ),
  constraint profil_gereja_rekening_nama_bank_check check (btrim(nama_bank) <> '' and char_length(nama_bank) <= 100),
  constraint profil_gereja_rekening_nomor_check check (nomor_rekening ~ '^[0-9]([0-9 -]{0,38}[0-9])?$'),
  constraint profil_gereja_rekening_atas_nama_check check (btrim(atas_nama) <> '' and char_length(atas_nama) <= 150),
  constraint profil_gereja_rekening_qris_foto_check check (
    (qris_foto_path is null) = (qris_foto_alt is null)
    and private.is_situs_photo_path(qris_foto_path)
    and btrim(qris_foto_alt) <> '' and char_length(qris_foto_alt) <= 300
  )
);

comment on table public.profil_gereja_rekening is
  'Profil Gereja section Persembahan (brief §14.1), a single row with id = 1. Writes need situs_rekening:update.';

insert into public.profil_gereja_rekening (id) values (1);

create trigger touch_updated_at
  before update on public.profil_gereja_rekening
  for each row execute function private.touch_updated_at();

create trigger enforce_situs_photo_paths
  before insert or update on public.profil_gereja_rekening
  for each row execute function private.enforce_situs_photo_paths('qris_foto_path');

-- ---------------------------------------------------------------------------
-- 5. profil_gereja_linimasa
-- ---------------------------------------------------------------------------

create table public.profil_gereja_linimasa (
  id uuid primary key default gen_random_uuid(),
  -- Free text, e.g. "1950-an".
  tahun text not null constraint profil_gereja_linimasa_tahun_check check (btrim(tahun) <> '' and char_length(tahun) <= 20),
  teks text not null constraint profil_gereja_linimasa_teks_check check (btrim(teks) <> '' and char_length(teks) <= 500),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Same contract as reorder_litbang_categories (0022): `p_ids` must be exactly
-- the current set of rows, or nothing changes.
create or replace function public.reorder_profil_linimasa(p_ids uuid[])
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
    or (select count(*) from public.profil_gereja_linimasa) <> cardinality(v_ids)
    or exists (
      select 1 from unnest(v_ids) as x (id)
      where not exists (select 1 from public.profil_gereja_linimasa l where l.id = x.id)
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Daftar linimasa sudah berubah. Muat ulang halaman lalu coba lagi.';
  end if;

  update public.profil_gereja_linimasa l
  set sort_order = o.ord - 1
  from unnest(v_ids) with ordinality as o (id, ord)
  where l.id = o.id
    and l.sort_order is distinct from o.ord - 1;
end;
$$;

revoke all on function public.reorder_profil_linimasa(uuid[]) from public, anon;
grant execute on function public.reorder_profil_linimasa(uuid[]) to authenticated;

-- Persembahan save with old and new values for the activity log (brief
-- §14.1). The row is locked while it's read, so the "old" values are exactly
-- what this update replaced. Invoker: RLS (situs_rekening:update) applies too.
-- The QRIS path and alt are always the ones passed (both null for no photo).
create or replace function public.update_profil_gereja_rekening(
  p_nama_bank text default null,
  p_nomor_rekening text default null,
  p_atas_nama text default null,
  p_qris_foto_path text default null,
  p_qris_foto_alt text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_old public.profil_gereja_rekening;
  v_new public.profil_gereja_rekening;
begin
  if not public.has_permission(auth.uid(), 'situs_rekening', 'update') then
    raise exception using errcode = '42501', message = 'Kamu tidak punya akses untuk tindakan ini.';
  end if;

  select * into v_old from public.profil_gereja_rekening where id = 1 for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Data rekening tidak ditemukan.';
  end if;

  update public.profil_gereja_rekening
  set nama_bank = p_nama_bank,
      nomor_rekening = p_nomor_rekening,
      atas_nama = p_atas_nama,
      qris_foto_path = p_qris_foto_path,
      qris_foto_alt = p_qris_foto_alt
  where id = 1
  returning * into v_new;

  if not found then
    raise exception using errcode = '42501', message = 'Kamu tidak punya akses untuk tindakan ini.';
  end if;

  return jsonb_build_object(
    'old', jsonb_build_object(
      'nama_bank', v_old.nama_bank, 'nomor_rekening', v_old.nomor_rekening, 'atas_nama', v_old.atas_nama,
      'qris_foto_path', v_old.qris_foto_path, 'qris_foto_alt', v_old.qris_foto_alt
    ),
    'new', jsonb_build_object(
      'nama_bank', v_new.nama_bank, 'nomor_rekening', v_new.nomor_rekening, 'atas_nama', v_new.atas_nama,
      'qris_foto_path', v_new.qris_foto_path, 'qris_foto_alt', v_new.qris_foto_alt
    )
  );
end;
$$;

revoke all on function public.update_profil_gereja_rekening(text, text, text, text, text) from public, anon;
grant execute on function public.update_profil_gereja_rekening(text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.profil_gereja enable row level security;
alter table public.profil_gereja_rekening enable row level security;
alter table public.profil_gereja_linimasa enable row level security;

-- anon reads only through public_profil_gereja().
revoke all on public.profil_gereja, public.profil_gereja_rekening, public.profil_gereja_linimasa from anon;
-- The singletons are created here and never removed.
revoke insert, delete, truncate on public.profil_gereja, public.profil_gereja_rekening from authenticated;

create policy profil_gereja_select on public.profil_gereja
  for select to authenticated
  using (public.has_permission(auth.uid(), 'situs', 'read'));
create policy profil_gereja_update on public.profil_gereja
  for update to authenticated
  using (public.has_permission(auth.uid(), 'situs', 'update'))
  with check (public.has_permission(auth.uid(), 'situs', 'update'));

create policy profil_gereja_rekening_select on public.profil_gereja_rekening
  for select to authenticated
  using (public.has_permission(auth.uid(), 'situs', 'read'));
create policy profil_gereja_rekening_update on public.profil_gereja_rekening
  for update to authenticated
  using (public.has_permission(auth.uid(), 'situs_rekening', 'update'))
  with check (public.has_permission(auth.uid(), 'situs_rekening', 'update'));

create policy profil_gereja_linimasa_select on public.profil_gereja_linimasa
  for select to authenticated
  using (public.has_permission(auth.uid(), 'situs', 'read'));
create policy profil_gereja_linimasa_insert on public.profil_gereja_linimasa
  for insert to authenticated
  with check (public.has_permission(auth.uid(), 'situs', 'create'));
create policy profil_gereja_linimasa_update on public.profil_gereja_linimasa
  for update to authenticated
  using (public.has_permission(auth.uid(), 'situs', 'update'))
  with check (public.has_permission(auth.uid(), 'situs', 'update'));
create policy profil_gereja_linimasa_delete on public.profil_gereja_linimasa
  for delete to authenticated
  using (public.has_permission(auth.uid(), 'situs', 'delete'));

-- ---------------------------------------------------------------------------
-- 7. Public read
-- ---------------------------------------------------------------------------

-- Exactly the fields the public site shows (brief §14, §14.6); updated_at
-- and anything admin-only stay out. Photos come as path + alt; the app builds
-- the public URL.
create or replace function public.public_profil_gereja()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'hero_judul', p.hero_judul,
    'hero_subjudul', p.hero_subjudul,
    'hero_foto_path', p.hero_foto_path,
    'hero_foto_alt', p.hero_foto_alt,
    'sambutan_teks', p.sambutan_teks,
    'sambutan_nama', p.sambutan_nama,
    'sambutan_jabatan', p.sambutan_jabatan,
    'sambutan_foto_path', p.sambutan_foto_path,
    'sambutan_foto_alt', p.sambutan_foto_alt,
    'sejarah', p.sejarah,
    'visi', p.visi,
    'misi', to_jsonb(p.misi),
    'sejarah_foto_path', p.sejarah_foto_path,
    'sejarah_foto_alt', p.sejarah_foto_alt,
    'alamat', p.alamat,
    'telepon', p.telepon,
    'email', p.email,
    'jam_sekretariat', p.jam_sekretariat,
    'maps_url', p.maps_url,
    'instagram_url', p.instagram_url,
    'youtube_url', p.youtube_url,
    'facebook_url', p.facebook_url,
    'nama_bank', r.nama_bank,
    'nomor_rekening', r.nomor_rekening,
    'atas_nama', r.atas_nama,
    'qris_foto_path', r.qris_foto_path,
    'qris_foto_alt', r.qris_foto_alt,
    'linimasa', coalesce(
      (
        select jsonb_agg(jsonb_build_object('tahun', l.tahun, 'teks', l.teks) order by l.sort_order, l.created_at, l.id)
        from public.profil_gereja_linimasa l
      ),
      '[]'::jsonb
    )
  )
  from public.profil_gereja p
  left join public.profil_gereja_rekening r on r.id = 1
  where p.id = 1;
$$;

revoke all on function public.public_profil_gereja() from public, anon, authenticated, service_role;
grant execute on function public.public_profil_gereja() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. Referenced photo paths
-- ---------------------------------------------------------------------------

-- Every path a row refers to. The server deletes an object only when it is
-- not in this set, and the orphan sweep removes objects that aren't. Stage
-- 11b adds its tables here. Needs situs:update (only photo mutations call it).
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
    select r.qris_foto_path from public.profil_gereja_rekening r where r.qris_foto_path is not null;
end;
$$;

revoke all on function public.situs_referenced_photo_paths() from public, anon, authenticated, service_role;
grant execute on function public.situs_referenced_photo_paths() to authenticated;
