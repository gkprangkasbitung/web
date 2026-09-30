-- Stage 11c: Pendeta (brief §14.7).
--
-- Same `situs` permission as every other Konten Situs module: read ->
-- situs:read, add/edit -> situs:update, delete -> situs:delete (this was
-- the explicit instruction for this stage, matching Kegiatan's convention,
-- not Linimasa's situs:create-for-insert one). No new permission rows.
--
-- 1. pendeta: a table-pattern list (brief §9.2), an optional photo, a
--    service-year range with Jakarta-"current year" CHECK constraints, and
--    a fixed (not manually reorderable) default order.
-- 2. public_pendeta(): the only way anon reads pendeta rows, returning only
--    the columns the public site shows (no audit columns), already ordered.
-- 3. profil_gereja: the old sambutan_nama/sambutan_jabatan/sambutan_foto_*
--    columns are replaced by sambutan_pendeta_id, a FK to pendeta (set null
--    on delete). Any existing Sambutan pastor data is moved into a new
--    pendeta row first, in this same migration, before the old columns are
--    dropped:
--      - There is no real Sambutan data anywhere yet (profil_gereja's row
--        is still all-null in both the seed and every environment this app
--        has been deployed to — deploy notes through stage 11b all say
--        "push before deploying", i.e. nothing has reached production).
--        The move below is still written generically (not seed-specific),
--        so a local dev database that *did* fill in Sambutan by hand keeps
--        that pastor's name, title, and photo instead of losing them.
--      - tahun_mulai is required on pendeta but was never captured for the
--        old Sambutan fields, so there is no real value to carry over
--        without inventing one. The moved row uses the current year
--        (Asia/Jakarta) as a clearly-provisional start year, satisfying the
--        CHECK below; an admin corrects it once through the new /admin/pendeta
--        form. This only ever affects a hand-filled local row, never real data.
-- 4. situs_referenced_photo_paths() (0029/0030) is extended with pendeta.

-- ---------------------------------------------------------------------------
-- Shared helper: "current year" in Asia/Jakarta (private schema, stage 11a's
-- convention: internal helpers for constraints/triggers, not exposed by the API).
-- ---------------------------------------------------------------------------

create or replace function private.current_year_jakarta()
returns int
language sql
stable
set search_path = ''
as $$
  select extract(year from (now() at time zone 'Asia/Jakarta'))::int;
$$;

-- ---------------------------------------------------------------------------
-- 1. pendeta
-- ---------------------------------------------------------------------------

create table public.pendeta (
  id uuid primary key default gen_random_uuid(),
  nama text not null constraint pendeta_nama_check check (btrim(nama) <> '' and char_length(nama) <= 200),
  peran text not null constraint pendeta_peran_check check (btrim(peran) <> '' and char_length(peran) <= 200),
  tahun_mulai int not null,
  tahun_selesai int,
  foto_path text,
  foto_alt text,
  keterangan text constraint pendeta_keterangan_check check (keterangan is null or (btrim(keterangan) <> '' and char_length(keterangan) <= 500)),
  tampil boolean not null default true,
  created_at timestamptz not null default now(),

  -- tahun_mulai: 1800 through this year (Asia/Jakarta). Evaluated at
  -- write time, which is exactly what brief §14.7 asks for ("tahun di masa
  -- depan ditolak"); it is not re-checked as the calendar moves on, same as
  -- every other write-time-only rule in this codebase (e.g. 0025's rules).
  constraint pendeta_tahun_mulai_check check (tahun_mulai between 1800 and private.current_year_jakarta()),
  -- tahun_selesai: null (still serving), or between tahun_mulai and this year.
  constraint pendeta_tahun_selesai_check check (
    tahun_selesai is null
    or (tahun_selesai >= tahun_mulai and tahun_selesai <= private.current_year_jakarta())
  ),

  constraint pendeta_foto_check check (
    (foto_path is null) = (foto_alt is null)
    and private.is_situs_photo_path(foto_path)
    and btrim(foto_alt) <> '' and char_length(foto_alt) <= 300
  )
);

comment on table public.pendeta is
  'Pastors, past and present (brief §14.7). Order is fixed (serving first, then by tahun_selesai desc, tahun_mulai desc), never manually reordered.';

create trigger enforce_situs_photo_paths
  before insert or update on public.pendeta
  for each row execute function private.enforce_situs_photo_paths('foto_path');

alter table public.pendeta enable row level security;
-- anon reads only through public_pendeta(), never the table directly (it
-- carries created_at and tampil = false rows, brief §14.7's "tanpa kolom audit").
revoke all on public.pendeta from anon;

create policy pendeta_select on public.pendeta
  for select to authenticated
  using (public.has_permission(auth.uid(), 'situs', 'read'));
create policy pendeta_insert on public.pendeta
  for insert to authenticated
  with check (public.has_permission(auth.uid(), 'situs', 'update'));
create policy pendeta_update on public.pendeta
  for update to authenticated
  using (public.has_permission(auth.uid(), 'situs', 'update'))
  with check (public.has_permission(auth.uid(), 'situs', 'update'));
create policy pendeta_delete on public.pendeta
  for delete to authenticated
  using (public.has_permission(auth.uid(), 'situs', 'delete'));

-- Exactly the fields the public site shows, and only tampil = true rows,
-- already in the brief's default order (currently serving first, then past
-- pastors by tahun_selesai desc, then tahun_mulai desc). No updated_at, no
-- tampil column itself, no created_at.
create or replace function public.public_pendeta()
returns table (
  id uuid,
  nama text,
  peran text,
  tahun_mulai int,
  tahun_selesai int,
  foto_path text,
  foto_alt text,
  keterangan text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.nama, p.peran, p.tahun_mulai, p.tahun_selesai, p.foto_path, p.foto_alt, p.keterangan
  from public.pendeta p
  where p.tampil = true
  order by p.tahun_selesai desc nulls first, p.tahun_mulai desc, p.id;
$$;

revoke all on function public.public_pendeta() from public, anon, authenticated, service_role;
grant execute on function public.public_pendeta() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. profil_gereja: sambutan_nama/sambutan_jabatan/sambutan_foto_* -> a
--    pastor picked from pendeta instead (brief §14.7).
-- ---------------------------------------------------------------------------

alter table public.profil_gereja
  add column sambutan_pendeta_id uuid references public.pendeta (id) on delete set null;

-- Move any existing Sambutan pastor into its own pendeta row (see the file
-- header for why tahun_mulai is the current year here, and why this is safe).
do $$
declare
  v_row public.profil_gereja;
  v_pendeta_id uuid;
begin
  select * into v_row from public.profil_gereja where id = 1;
  if v_row.sambutan_nama is not null then
    insert into public.pendeta (nama, peran, tahun_mulai, foto_path, foto_alt, tampil)
    values (
      v_row.sambutan_nama,
      coalesce(v_row.sambutan_jabatan, 'Pendeta Jemaat'),
      private.current_year_jakarta(),
      v_row.sambutan_foto_path,
      v_row.sambutan_foto_alt,
      true
    )
    returning id into v_pendeta_id;

    update public.profil_gereja set sambutan_pendeta_id = v_pendeta_id where id = 1;
  end if;
end;
$$;

alter table public.profil_gereja
  drop column sambutan_nama,
  drop column sambutan_jabatan,
  drop column sambutan_foto_path,
  drop column sambutan_foto_alt;

-- Recreate with the current photo column list (hero, sejarah — sambutan's
-- photo now lives on pendeta, covered by its own trigger above).
drop trigger enforce_situs_photo_paths on public.profil_gereja;
create trigger enforce_situs_photo_paths
  before insert or update on public.profil_gereja
  for each row execute function private.enforce_situs_photo_paths('hero_foto_path', 'sejarah_foto_path');

-- ---------------------------------------------------------------------------
-- 3. public_profil_gereja(): Sambutan's pastor fields now come from a join,
--    regardless of that pendeta's own `tampil` (picking them for Sambutan is
--    a deliberate admin choice, independent of whether they also show on
--    the Tentang Kami pendeta list).
-- ---------------------------------------------------------------------------

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
    'sambutan_pendeta_nama', d.nama,
    'sambutan_pendeta_peran', d.peran,
    'sambutan_pendeta_foto_path', d.foto_path,
    'sambutan_pendeta_foto_alt', d.foto_alt,
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
  left join public.pendeta d on d.id = p.sambutan_pendeta_id
  where p.id = 1;
$$;

-- ---------------------------------------------------------------------------
-- 4. Referenced photo paths (0029/0030's function, extended with pendeta)
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
    cross join lateral unnest(array[p.hero_foto_path, p.sejarah_foto_path]) as x (path)
    where x.path is not null
    union
    select r.qris_foto_path from public.profil_gereja_rekening r where r.qris_foto_path is not null
    union
    select m.foto_path from public.majelis m where m.foto_path is not null
    union
    select k.foto_path from public.kegiatan k where k.foto_path is not null
    union
    select d.foto_path from public.pendeta d where d.foto_path is not null;
end;
$$;
