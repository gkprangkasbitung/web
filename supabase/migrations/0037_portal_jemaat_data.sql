-- Stage 13a: Portal Jemaat backend (brief §17.1, §17.2).
--
-- 1. profil_gereja.portal_tampilkan_persembahan: the site setting that turns
--    the jemaat's own Persembahan Bulanan list on (default off). Changed
--    through profil_gereja's existing update policy (situs:update).
-- 2. jemaat_pengajuan_perubahan: change requests from the Portal Jemaat.
--    RLS on, readable with warta:read, and no write policy at all: jemaat
--    write only through the portal functions below, staff decide only
--    through setujui_pengajuan / tolak_pengajuan.
--    - private.pengajuan_data_error(): the one definition of what a request
--      may contain (no_hp, alamat, pekerjaan; formats and lengths), used by
--      the table's CHECK and by portal.ajukan_perubahan().
-- 3. Schema `portal`: only SECURITY DEFINER functions with an empty
--    search_path. Each derives the caller's jemaat from auth.uid() through
--    portal._jemaat_id_saya() and never takes a jemaat, keluarga, or user id.
--    - authenticated gets usage on the schema and execute per function;
--      anon gets nothing. The schema must be added to the API's exposed
--      schemas (docs/deploy-checklist.md).
--    - An account without a jemaat link gets SQLSTATE PT403 ("Akun ini belum
--      terhubung ke data jemaat."); PostgREST answers it with HTTP 403.
--    - No portal function reads jemaat_catatan_pastoral.
--    - Role labels (Liturgos vs Pelayan Liturgi, SMKA group names) are not
--      repeated here: pelayanan_saya() returns keys, and the app labels them
--      from the category config in src/lib/peribadahan.ts.
-- 4. setujui_pengajuan / tolak_pengajuan: the admin's decision, each one
--    atomic RPC that checks warta:update itself.

-- ---------------------------------------------------------------------------
-- 1. Setting
-- ---------------------------------------------------------------------------

alter table public.profil_gereja
  add column portal_tampilkan_persembahan boolean not null default false;

comment on column public.profil_gereja.portal_tampilkan_persembahan is
  'Portal Jemaat: show each jemaat their own Persembahan Bulanan (brief §17.1). Off by default.';

-- ---------------------------------------------------------------------------
-- 2. jemaat_pengajuan_perubahan
-- ---------------------------------------------------------------------------

-- null when p_data is a valid request, else the message to show. Valid =
-- a non-empty object whose keys are no_hp, alamat, or pekerjaan, each value
-- null (clear the field) or a trimmed, non-empty string: no_hp digits only
-- (8-15), alamat at most 500 and pekerjaan at most 200 characters (the
-- admin form's limits).
create or replace function private.pengajuan_data_error(p_data jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_key text;
  v_value jsonb;
  v_text text;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    return 'Data yang dikirim tidak valid.';
  end if;
  if p_data = '{}'::jsonb then
    return 'Pilih minimal satu data yang ingin diubah.';
  end if;

  for v_key, v_value in select e.key, e.value from jsonb_each(p_data) as e loop
    if v_key not in ('no_hp', 'alamat', 'pekerjaan') then
      return format(
        'Data "%s" tidak bisa diajukan lewat Portal Jemaat. Yang bisa diajukan hanya No. HP, Alamat, dan Pekerjaan.',
        left(v_key, 50)
      );
    end if;
    continue when jsonb_typeof(v_value) = 'null';
    if jsonb_typeof(v_value) <> 'string' then
      return 'Data yang dikirim tidak valid.';
    end if;

    v_text := v_value #>> '{}';
    if v_text = '' or v_text <> regexp_replace(v_text, '^[[:space:]]+|[[:space:]]+$', '', 'g') then
      return 'Data yang dikirim tidak valid.';
    end if;
    if v_key = 'no_hp' and v_text !~ '^[0-9]{8,15}$' then
      return 'No. HP hanya boleh berisi angka, 8 sampai 15 digit.';
    end if;
    if v_key = 'alamat' and char_length(v_text) > 500 then
      return 'Alamat maksimal 500 karakter.';
    end if;
    if v_key = 'pekerjaan' and char_length(v_text) > 200 then
      return 'Pekerjaan maksimal 200 karakter.';
    end if;
  end loop;

  return null;
end;
$$;

revoke all on function private.pengajuan_data_error(jsonb) from public;

create table public.jemaat_pengajuan_perubahan (
  id uuid primary key default gen_random_uuid(),
  jemaat_id uuid not null references public.jemaat (id) on delete cascade,
  -- Set null when that login is deleted (§17.4); a waiting request stays
  -- waiting and can still be decided.
  diajukan_oleh uuid references auth.users (id) on delete set null,
  -- Only the fields that differ from the jemaat's data when submitted.
  data jsonb not null,
  status text not null default 'menunggu',
  catatan_admin text,
  ditinjau_oleh uuid references auth.users (id) on delete set null,
  ditinjau_pada timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint jemaat_pengajuan_perubahan_status_check
    check (status in ('menunggu', 'disetujui', 'ditolak', 'dibatalkan')),
  constraint jemaat_pengajuan_perubahan_data_check
    check (private.pengajuan_data_error(data) is null),
  -- Reviewed (approved or rejected) exactly when ditinjau_pada is set.
  constraint jemaat_pengajuan_perubahan_ditinjau_check check (
    (status in ('disetujui', 'ditolak')) = (ditinjau_pada is not null)
    and (ditinjau_oleh is null or status in ('disetujui', 'ditolak'))
  ),
  -- A rejection always says why; nothing else carries a note.
  constraint jemaat_pengajuan_perubahan_catatan_check check (
    (status = 'ditolak') = (catatan_admin is not null)
    and (catatan_admin is null or (btrim(catatan_admin) <> '' and char_length(catatan_admin) <= 500))
  )
);

comment on table public.jemaat_pengajuan_perubahan is
  'Change requests from the Portal Jemaat (brief §17.2). No write policy: written only by the portal functions and setujui/tolak_pengajuan.';

-- At most one waiting request per jemaat.
create unique index jemaat_pengajuan_perubahan_satu_menunggu
  on public.jemaat_pengajuan_perubahan (jemaat_id) where status = 'menunggu';
create index jemaat_pengajuan_perubahan_jemaat_idx
  on public.jemaat_pengajuan_perubahan (jemaat_id, created_at desc);
create index jemaat_pengajuan_perubahan_status_idx
  on public.jemaat_pengajuan_perubahan (status, created_at desc);

create trigger touch_updated_at
  before update on public.jemaat_pengajuan_perubahan
  for each row execute function private.touch_updated_at();

alter table public.jemaat_pengajuan_perubahan enable row level security;
revoke all on public.jemaat_pengajuan_perubahan from anon, authenticated;
grant select on public.jemaat_pengajuan_perubahan to authenticated;

create policy jemaat_pengajuan_perubahan_select on public.jemaat_pengajuan_perubahan
  for select to authenticated
  using (public.has_permission(auth.uid(), 'warta', 'read'));

-- ---------------------------------------------------------------------------
-- 3. Schema portal
-- ---------------------------------------------------------------------------

create schema portal;

comment on schema portal is
  'Portal Jemaat (brief §17.1): SECURITY DEFINER functions scoped to the caller''s own jemaat. Exposed through the API; anon has no access.';

revoke all on schema portal from public, anon;
grant usage on schema portal to authenticated;

-- New functions here must be granted one by one; none is executable by
-- PUBLIC by default.
alter default privileges in schema portal revoke execute on functions from public;

-- The caller's jemaat id. Internal: no role may execute it directly; the
-- portal functions (same owner) call it.
create or replace function portal._jemaat_id_saya()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_jemaat uuid;
begin
  select p.jemaat_id into v_jemaat from public.profiles p where p.id = auth.uid();
  if v_jemaat is null then
    raise exception using
      errcode = 'PT403',
      message = 'Akun ini belum terhubung ke data jemaat.',
      hint = 'Portal Jemaat hanya untuk akun yang terhubung ke data jemaat.';
  end if;
  return v_jemaat;
end;
$$;

revoke all on function portal._jemaat_id_saya() from public, anon, authenticated;

-- Profil: the caller's own record, without ids, labels, or the legacy
-- sudah_baptis / sudah_sidi columns.
create or replace function portal.profil_saya()
returns table (
  nama text,
  nomor_anggota text,
  jenis_kelamin text,
  status_keanggotaan text,
  wilayah_nama text,
  keluarga_nama text,
  hubungan_keluarga text,
  tanggal_lahir date,
  tanggal_masuk date,
  pekerjaan text,
  alamat text,
  no_hp text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_jemaat uuid := portal._jemaat_id_saya();
begin
  return query
    select
      j.nama,
      j.nomor_anggota,
      j.jenis_kelamin,
      j.status_keanggotaan,
      w.nama,
      k.nama,
      j.hubungan_keluarga,
      j.tanggal_lahir,
      j.tanggal_masuk,
      j.pekerjaan,
      j.alamat,
      j.no_hp
    from public.jemaat j
    left join public.wilayah w on w.id = j.wilayah_id
    left join public.keluarga k on k.id = j.keluarga_id
    where j.id = v_jemaat;
end;
$$;

-- Keluarga: every member of the caller's family (the caller included),
-- name, hubungan and status only. Empty without a family.
create or replace function portal.keluarga_saya()
returns table (nama text, hubungan_keluarga text, status_keanggotaan text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_jemaat uuid := portal._jemaat_id_saya();
  v_keluarga uuid;
begin
  select j.keluarga_id into v_keluarga from public.jemaat j where j.id = v_jemaat;
  if v_keluarga is null then
    return;
  end if;
  return query
    select j.nama, j.hubungan_keluarga, j.status_keanggotaan
    from public.jemaat j
    where j.keluarga_id = v_keluarga
    order by
      coalesce(
        array_position(array['Kepala Keluarga', 'Istri', 'Anak', 'Orang Tua', 'Kerabat Lain']::text[], j.hubungan_keluarga),
        99
      ),
      j.nama,
      j.id;
end;
$$;

-- Pelayanan: one row per role the caller fills on a schedule row dated
-- dari .. sampai (at most 400 days, both ends included). peran is
-- pelayan_firman, liturgos, pemusik, pnj, or smka_pf (with smka_kelompok).
create or replace function portal.pelayanan_saya(dari date, sampai date)
returns table (
  tanggal date,
  jam time,
  kategori_key text,
  kategori_nama text,
  tempat_nama text,
  peran text,
  smka_kelompok text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_jemaat uuid := portal._jemaat_id_saya();
begin
  if dari is null or sampai is null then
    raise exception using errcode = '22023', message = 'Rentang tanggal wajib diisi.';
  end if;
  if dari > sampai then
    raise exception using errcode = '22023', message = 'Tanggal awal tidak boleh setelah tanggal akhir.';
  end if;
  if sampai - dari + 1 > 400 then
    raise exception using errcode = '22023', message = 'Rentang tanggal paling lama 400 hari.';
  end if;

  return query
    with tugas as (
      select i.id as item_id, r.kunci, null::text as kelompok, r.urutan
      from public.peribadahan_items i
      cross join lateral (
        values
          ('pelayan_firman', i.pelayan_firman_id, 1),
          ('liturgos', i.liturgos_id, 2),
          ('pemusik', i.pemusik_id, 3),
          ('pnj', i.pnj_id, 4)
      ) as r (kunci, jemaat_id, urutan)
      where i.tanggal between dari and sampai
        and r.jemaat_id = v_jemaat
      union all
      select
        k.item_id,
        'smka_pf',
        k.kelompok,
        4 + array_position(
          array['batita', 'balita', 'kecil', 'tanggung', 'besar', 'tunas_remaja', 'guru_sekolah_minggu', 'orang_tua']::text[],
          k.kelompok
        )
      from public.peribadahan_smka_kelompok k
      join public.peribadahan_items i on i.id = k.item_id
      where i.tanggal between dari and sampai
        and k.pf_id = v_jemaat
    )
    select i.tanggal, i.jam, c.key, c.name, t.nama, g.kunci, g.kelompok
    from tugas g
    join public.peribadahan_items i on i.id = g.item_id
    join public.peribadahan_categories c on c.id = i.category_id
    left join public.tempat t on t.id = i.tempat_id
    order by i.tanggal, i.jam nulls last, i.sort_order, i.created_at, i.id, g.urutan;
end;
$$;

-- Komisi: the same visibility as the public site (§14.8): only komisi with
-- tampil = true, and a membership only while the member is eligible (sidi
-- or anggota_penuh). Being a komisi's pembina is listed as "Pembina".
create or replace function portal.komisi_saya()
returns table (komisi_nama text, komisi_slug text, periode text, jabatan_nama text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_jemaat uuid := portal._jemaat_id_saya();
begin
  return query
    select x.nama, x.slug, x.periode, x.jabatan
    from (
      select k.nama, k.slug, k.periode, 'Pembina'::text as jabatan, k.sort_order, k.created_at, k.id, -1 as jabatan_urutan
      from public.komisi k
      where k.pembina_jemaat_id = v_jemaat
        and k.tampil = true
      union all
      select k.nama, k.slug, k.periode, jb.nama, k.sort_order, k.created_at, k.id, jb.sort_order
      from public.komisi_anggota ka
      join public.komisi k on k.id = ka.komisi_id
      join public.jabatan_komisi jb on jb.id = ka.jabatan_id
      join public.jemaat j on j.id = ka.jemaat_id
      where ka.jemaat_id = v_jemaat
        and k.tampil = true
        and j.status_keanggotaan in ('sidi', 'anggota_penuh')
    ) as x
    order by x.sort_order, x.created_at, x.id, x.jabatan_urutan;
end;
$$;

-- Persembahan: the caller's own Persembahan Bulanan rows in one year
-- (tanggal + jumlah). Nothing while profil_gereja.portal_tampilkan_persembahan
-- is off. Family members' rows never count as the caller's.
create or replace function portal.persembahan_saya(tahun int)
returns table (tanggal date, jumlah numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_jemaat uuid := portal._jemaat_id_saya();
begin
  if tahun is null or tahun < 1900 or tahun > 2100 then
    raise exception using errcode = '22023', message = 'Tahun tidak valid.';
  end if;
  if not coalesce((select pg.portal_tampilkan_persembahan from public.profil_gereja pg where pg.id = 1), false) then
    return;
  end if;

  return query
    select t.tanggal, t.jumlah
    from public.sarana_dana_transactions t
    join public.sarana_dana_items it on it.id = t.item_id
    where it.key = 'persembahan_bulanan'
      and t.tipe = 'masuk'
      and t.jemaat_id = v_jemaat
      and t.tanggal between make_date(tahun, 1, 1) and make_date(tahun, 12, 31)
    order by t.tanggal, t.created_at, t.id;
end;
$$;

-- The portal's own settings, for showing or hiding its pages.
create or replace function portal.pengaturan_portal()
returns table (tampilkan_persembahan boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform portal._jemaat_id_saya();
  return query
    select coalesce((select pg.portal_tampilkan_persembahan from public.profil_gereja pg where pg.id = 1), false);
end;
$$;

-- The caller's jemaat's change requests, newest first. Who reviewed them is
-- left out.
create or replace function portal.pengajuan_saya()
returns table (
  id uuid,
  data jsonb,
  status text,
  catatan_admin text,
  created_at timestamptz,
  ditinjau_pada timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_jemaat uuid := portal._jemaat_id_saya();
begin
  return query
    select pp.id, pp.data, pp.status, pp.catatan_admin, pp.created_at, pp.ditinjau_pada
    from public.jemaat_pengajuan_perubahan pp
    where pp.jemaat_id = v_jemaat
    order by pp.created_at desc, pp.id;
end;
$$;

-- Submits a change request for the caller's own jemaat. data: an object
-- with no_hp, alamat, and/or pekerjaan; strings are trimmed and an empty
-- string clears the field. Only the fields that differ from the current
-- data are stored. Refused while another request is still waiting.
create or replace function portal.ajukan_perubahan(data jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_jemaat uuid := portal._jemaat_id_saya();
  v_input jsonb := ajukan_perubahan.data;
  v_clean jsonb := '{}'::jsonb;
  v_key text;
  v_value jsonb;
  v_text text;
  v_error text;
  v_current public.jemaat%rowtype;
  v_id uuid;
  c_waiting constant text :=
    'Masih ada pengajuan perubahan yang menunggu ditinjau. Batalkan dulu atau tunggu sampai ditinjau.';
begin
  if exists (
    select 1 from public.jemaat_pengajuan_perubahan pp
    where pp.jemaat_id = v_jemaat and pp.status = 'menunggu'
  ) then
    raise exception using errcode = '23505', message = c_waiting;
  end if;

  if v_input is null or jsonb_typeof(v_input) <> 'object' then
    raise exception using errcode = '22023', message = 'Data yang dikirim tidak valid.';
  end if;

  for v_key, v_value in select e.key, e.value from jsonb_each(v_input) as e loop
    if jsonb_typeof(v_value) = 'string' then
      v_text := regexp_replace(v_value #>> '{}', '^[[:space:]]+|[[:space:]]+$', '', 'g');
      v_value := case when v_text = '' then 'null'::jsonb else to_jsonb(v_text) end;
    end if;
    v_clean := v_clean || jsonb_build_object(v_key, v_value);
  end loop;

  v_error := private.pengajuan_data_error(v_clean);
  if v_error is not null then
    raise exception using errcode = '22023', message = v_error;
  end if;

  select j.* into v_current from public.jemaat j where j.id = v_jemaat;
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_clean
  from jsonb_each(v_clean) as e
  where (e.value #>> '{}') is distinct from case e.key
    when 'no_hp' then v_current.no_hp
    when 'alamat' then v_current.alamat
    else v_current.pekerjaan
  end;
  if v_clean = '{}'::jsonb then
    raise exception using errcode = '22023', message = 'Tidak ada perubahan dari data saat ini.';
  end if;

  begin
    insert into public.jemaat_pengajuan_perubahan (jemaat_id, diajukan_oleh, data)
    values (v_jemaat, auth.uid(), v_clean)
    returning jemaat_pengajuan_perubahan.id into v_id;
  exception when unique_violation then
    -- Another request was submitted at the same moment.
    raise exception using errcode = '23505', message = c_waiting;
  end;
  return v_id;
end;
$$;

-- Cancels one of the caller's jemaat's own requests while it is waiting.
-- Someone else's request is answered exactly like a missing one.
create or replace function portal.batalkan_pengajuan(id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_jemaat uuid := portal._jemaat_id_saya();
  v_status text;
begin
  select pp.status into v_status
  from public.jemaat_pengajuan_perubahan pp
  where pp.id = batalkan_pengajuan.id and pp.jemaat_id = v_jemaat
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Pengajuan tidak ditemukan.';
  end if;
  if v_status <> 'menunggu' then
    raise exception using errcode = '22023', message = 'Pengajuan ini sudah tidak menunggu, jadi tidak bisa dibatalkan.';
  end if;

  update public.jemaat_pengajuan_perubahan pp
  set status = 'dibatalkan'
  where pp.id = batalkan_pengajuan.id;
end;
$$;

revoke all on function portal.profil_saya() from public, anon;
revoke all on function portal.keluarga_saya() from public, anon;
revoke all on function portal.pelayanan_saya(date, date) from public, anon;
revoke all on function portal.komisi_saya() from public, anon;
revoke all on function portal.persembahan_saya(int) from public, anon;
revoke all on function portal.pengaturan_portal() from public, anon;
revoke all on function portal.pengajuan_saya() from public, anon;
revoke all on function portal.ajukan_perubahan(jsonb) from public, anon;
revoke all on function portal.batalkan_pengajuan(uuid) from public, anon;

grant execute on function portal.profil_saya() to authenticated;
grant execute on function portal.keluarga_saya() to authenticated;
grant execute on function portal.pelayanan_saya(date, date) to authenticated;
grant execute on function portal.komisi_saya() to authenticated;
grant execute on function portal.persembahan_saya(int) to authenticated;
grant execute on function portal.pengaturan_portal() to authenticated;
grant execute on function portal.pengajuan_saya() to authenticated;
grant execute on function portal.ajukan_perubahan(jsonb) to authenticated;
grant execute on function portal.batalkan_pengajuan(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The admin's decision (warta:update)
-- ---------------------------------------------------------------------------

-- Approves a waiting request: closes it and applies its fields to the
-- jemaat in one transaction. Returns the jemaat's name for the activity log.
-- SECURITY DEFINER because the table has no write policy; the permission is
-- checked here instead.
create or replace function public.setujui_pengajuan(p_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.jemaat_pengajuan_perubahan%rowtype;
  v_nama text;
begin
  if not public.has_permission(auth.uid(), 'warta', 'update') then
    raise exception using errcode = '42501', message = 'Kamu tidak punya akses untuk tindakan ini.';
  end if;

  select pp.* into v_row from public.jemaat_pengajuan_perubahan pp where pp.id = p_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Pengajuan tidak ditemukan.';
  end if;
  if v_row.status <> 'menunggu' then
    raise exception using errcode = '22023', message = 'Pengajuan ini sudah tidak menunggu.';
  end if;

  update public.jemaat_pengajuan_perubahan pp
  set status = 'disetujui', ditinjau_oleh = auth.uid(), ditinjau_pada = now()
  where pp.id = p_id;

  update public.jemaat j
  set
    no_hp = case when v_row.data ? 'no_hp' then v_row.data ->> 'no_hp' else j.no_hp end,
    alamat = case when v_row.data ? 'alamat' then v_row.data ->> 'alamat' else j.alamat end,
    pekerjaan = case when v_row.data ? 'pekerjaan' then v_row.data ->> 'pekerjaan' else j.pekerjaan end
  where j.id = v_row.jemaat_id
  returning j.nama into v_nama;
  if not found then
    raise exception using errcode = 'P0002', message = 'Data jemaat tidak ditemukan.';
  end if;

  return v_nama;
end;
$$;

-- Rejects a waiting request with a required note (1-500 characters).
-- Returns the jemaat's name for the activity log.
create or replace function public.tolak_pengajuan(p_id uuid, p_catatan text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_catatan text := regexp_replace(coalesce(p_catatan, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
  v_status text;
  v_nama text;
begin
  if not public.has_permission(auth.uid(), 'warta', 'update') then
    raise exception using errcode = '42501', message = 'Kamu tidak punya akses untuk tindakan ini.';
  end if;
  if v_catatan = '' then
    raise exception using errcode = '22023', message = 'Catatan penolakan wajib diisi.';
  end if;
  if char_length(v_catatan) > 500 then
    raise exception using errcode = '22023', message = 'Catatan penolakan maksimal 500 karakter.';
  end if;

  select pp.status, j.nama into v_status, v_nama
  from public.jemaat_pengajuan_perubahan pp
  join public.jemaat j on j.id = pp.jemaat_id
  where pp.id = p_id
  for update of pp;
  if not found then
    raise exception using errcode = 'P0002', message = 'Pengajuan tidak ditemukan.';
  end if;
  if v_status <> 'menunggu' then
    raise exception using errcode = '22023', message = 'Pengajuan ini sudah tidak menunggu.';
  end if;

  update public.jemaat_pengajuan_perubahan pp
  set status = 'ditolak', catatan_admin = v_catatan, ditinjau_oleh = auth.uid(), ditinjau_pada = now()
  where pp.id = p_id;

  return v_nama;
end;
$$;

revoke all on function public.setujui_pengajuan(uuid) from public, anon;
revoke all on function public.tolak_pengajuan(uuid, text) from public, anon;
grant execute on function public.setujui_pengajuan(uuid) to authenticated;
grant execute on function public.tolak_pengajuan(uuid, text) to authenticated;
