-- Stage 12a: additional data needed by the Warta DOCX generator (brief
-- §16.1). This stage only adds data and the server-side rules that protect
-- it; the DOCX template and generator themselves come in stage 12b.
--
-- 1. peribadahan_items: pnj_id + kehadiran_online, both valid only for the
--    `umum` category (Kebaktian Minggu). Unlike every other per-category
--    field (which the app's TypeScript layer silently nulls outside its
--    layout, brief §9.5, stage 6), these two get a DB-level trigger that
--    *rejects* the write outright — the explicit instruction for this
--    stage, and consistent with CLAUDE.md: a signed-in user can call the
--    Supabase REST API directly, bypassing the app's own nulling.
-- 2. warta: renungan_ayat (part of Section 1, Informasi & Renungan — the
--    existing optimistic-concurrency group) and the new "Bahan Bacaan &
--    Nyanyian" text fields (their own section, no concurrency control,
--    same stance as Litbang/Kesaksian edits).
-- 3. warta_pujian: an ordered, per-warta list of hymns/songs, with an
--    atomic reorder RPC scoped to one warta (unlike reorder_litbang_categories
--    and friends, which reorder a whole global table).
-- 4. profil_gereja_jadwal_rutin: an ordered, global list (same contract as
--    profil_gereja_linimasa, stage 11a), plus website_url and
--    telepon_sekretariat on profil_gereja itself.
-- 5. pendeta: no_hp (digits only, never returned by public_pendeta()) and
--    tampil_di_warta.

-- ---------------------------------------------------------------------------
-- 1. Peribadahan: Pemandu Nyanyian Jemaat + Kehadiran Online (umum only)
-- ---------------------------------------------------------------------------

alter table public.peribadahan_items
  add column pnj_id uuid references public.jemaat (id) on delete set null,
  add column kehadiran_online int;

alter table public.peribadahan_items
  add constraint peribadahan_items_kehadiran_online_check check (
    kehadiran_online is null or kehadiran_online >= 0
  );

-- Defense in depth, enforced at the database so a direct REST write (not
-- only the app's own nulling, lib/peribadahan.ts) can't set these two
-- fields on any category besides Kebaktian Minggu (`umum`).
create or replace function private.enforce_peribadahan_umum_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_key text;
begin
  if new.pnj_id is null and new.kehadiran_online is null then
    return new;
  end if;

  select c.key into v_key from public.peribadahan_categories c where c.id = new.category_id;

  if v_key is distinct from 'umum' then
    raise exception using
      errcode = '22023',
      message = 'Pemandu Nyanyian Jemaat dan Kehadiran Online hanya berlaku untuk Kebaktian Minggu.';
  end if;

  return new;
end;
$$;

create trigger enforce_peribadahan_umum_fields
  before insert or update on public.peribadahan_items
  for each row execute function private.enforce_peribadahan_umum_fields();

-- update_peribadahan_item (0024): adding parameters changes the function's
-- signature (argument types), which CREATE OR REPLACE can't do in place
-- (it would create an ambiguous overload instead) — drop, then recreate.
drop function if exists public.update_peribadahan_item(
  uuid, time, uuid, uuid, uuid, uuid, uuid, text, text, text, int, int, int, text, jsonb
);

create function public.update_peribadahan_item(
  p_id uuid,
  p_jam time default null,
  p_tempat_id uuid default null,
  p_wilayah_id uuid default null,
  p_pelayan_firman_id uuid default null,
  p_liturgos_id uuid default null,
  p_pemusik_id uuid default null,
  p_tema text default null,
  p_dpa text default null,
  p_catatan text default null,
  p_kehadiran_laki_laki int default null,
  p_kehadiran_perempuan int default null,
  p_kehadiran_anak int default null,
  p_bahan_alkitab text default null,
  p_smka_kelompok jsonb default null,
  p_pnj_id uuid default null,
  p_kehadiran_online int default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_key text;
begin
  if not public.has_permission(auth.uid(), 'warta', 'update') then
    raise exception using errcode = '42501', message = 'Kamu tidak punya akses untuk tindakan ini.';
  end if;

  select c.key into v_key
  from public.peribadahan_items i
  join public.peribadahan_categories c on c.id = i.category_id
  where i.id = p_id;

  if v_key is null then
    raise exception using errcode = 'P0002', message = 'Jadwal tidak ditemukan.';
  end if;

  if (p_kehadiran_laki_laki is not null and p_kehadiran_laki_laki < 0)
    or (p_kehadiran_perempuan is not null and p_kehadiran_perempuan < 0)
    or (p_kehadiran_anak is not null and p_kehadiran_anak < 0)
    or (p_kehadiran_online is not null and p_kehadiran_online < 0)
  then
    raise exception using errcode = '22023', message = 'Jumlah kehadiran tidak boleh negatif.';
  end if;

  if v_key = 'smka' then
    if p_smka_kelompok is null or jsonb_array_length(p_smka_kelompok) <> 8 then
      raise exception using errcode = '22023', message = 'Data kelompok SMKA tidak lengkap.';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_smka_kelompok) x
      where x ->> 'kelompok' not in (
        'batita', 'balita', 'kecil', 'tanggung', 'besar', 'tunas_remaja',
        'guru_sekolah_minggu', 'orang_tua'
      )
    ) or (select count(distinct x ->> 'kelompok') from jsonb_array_elements(p_smka_kelompok) x) <> 8
    then
      raise exception using errcode = '22023', message = 'Data kelompok SMKA tidak valid.';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_smka_kelompok) x
      where ((x ->> 'laki_laki') is not null and (x ->> 'laki_laki')::int < 0)
        or ((x ->> 'perempuan') is not null and (x ->> 'perempuan')::int < 0)
    ) then
      raise exception using errcode = '22023', message = 'Jumlah kehadiran tidak boleh negatif.';
    end if;
  elsif p_smka_kelompok is not null then
    raise exception using errcode = '22023', message = 'Data kelompok SMKA tidak berlaku untuk kategori ini.';
  end if;

  if v_key is distinct from 'umum' and (p_pnj_id is not null or p_kehadiran_online is not null) then
    raise exception using
      errcode = '22023',
      message = 'Pemandu Nyanyian Jemaat dan Kehadiran Online hanya berlaku untuk Kebaktian Minggu.';
  end if;

  update public.peribadahan_items
  set jam = p_jam,
      tempat_id = p_tempat_id,
      wilayah_id = p_wilayah_id,
      pelayan_firman_id = p_pelayan_firman_id,
      liturgos_id = p_liturgos_id,
      pemusik_id = p_pemusik_id,
      tema = p_tema,
      dpa = p_dpa,
      catatan = p_catatan,
      kehadiran_laki_laki = p_kehadiran_laki_laki,
      kehadiran_perempuan = p_kehadiran_perempuan,
      kehadiran_anak = p_kehadiran_anak,
      bahan_alkitab = p_bahan_alkitab,
      pnj_id = p_pnj_id,
      kehadiran_online = p_kehadiran_online,
      updated_at = now()
  where id = p_id;

  if v_key = 'smka' then
    insert into public.peribadahan_smka_kelompok (item_id, kelompok, pf_id, laki_laki, perempuan)
    select
      p_id,
      x ->> 'kelompok',
      case
        when x ->> 'kelompok' in ('guru_sekolah_minggu', 'orang_tua') then null
        else nullif(x ->> 'pf_id', '')::uuid
      end,
      (x ->> 'laki_laki')::int,
      (x ->> 'perempuan')::int
    from jsonb_array_elements(p_smka_kelompok) x
    on conflict (item_id, kelompok) do update
    set pf_id = excluded.pf_id, laki_laki = excluded.laki_laki, perempuan = excluded.perempuan;
  end if;
end;
$$;

revoke all on function public.update_peribadahan_item(
  uuid, time, uuid, uuid, uuid, uuid, uuid, text, text, text, int, int, int, text, jsonb, uuid, int
) from public, anon;
grant execute on function public.update_peribadahan_item(
  uuid, time, uuid, uuid, uuid, uuid, uuid, text, text, text, int, int, int, text, jsonb, uuid, int
) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Warta: renungan_ayat (Section 1) + Bahan Bacaan & Nyanyian fields
-- ---------------------------------------------------------------------------

alter table public.warta
  add column renungan_ayat text,
  add column tata_kebaktian text,
  add column nas_pembimbing text,
  add column pembacaan_alkitab text,
  add column pembacaan_mazmur text;

-- enforce_warta_rules: last replaced in 0028 (security definer, so a
-- deleted author's created_by can go null — see that migration's own
-- comment). Carrying that fix forward unchanged; the only change here is
-- renungan_ayat joining the Informasi/Renungan tuple that moves updated_at,
-- since it's edited inside Section 1 under the same optimistic-concurrency
-- check. The four Bahan Bacaan & Nyanyian fields are deliberately left out
-- (their own section, own endpoint, no concurrency control — same stance as
-- Litbang deskripsi/Kesaksian items).
create or replace function private.enforce_warta_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.created_by := auth.uid();
      new.status := 'draft';
    end if;
    new.published_at := case when new.status = 'published' then now() else null end;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  if new.slug is distinct from old.slug then
    raise exception using errcode = '22023', message = 'Slug warta tidak bisa diubah.';
  end if;

  if new.created_by is distinct from old.created_by then
    if new.created_by is not null
      or exists (select 1 from auth.users u where u.id = old.created_by)
    then
      new.created_by := old.created_by;
    end if;
  end if;
  new.created_at := old.created_at;

  if new.status is distinct from old.status then
    new.published_at := case when new.status = 'published' then now() else null end;
  else
    new.published_at := old.published_at;
  end if;

  if (
    new.tanggal_kebaktian, new.judul_kebaktian, new.tema_kebaktian,
    new.renungan_judul, new.renungan_kitab, new.renungan_ayat, new.renungan_isi, new.renungan_sumber
  ) is distinct from (
    old.tanggal_kebaktian, old.judul_kebaktian, old.tema_kebaktian,
    old.renungan_judul, old.renungan_kitab, old.renungan_ayat, old.renungan_isi, old.renungan_sumber
  ) then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;

  return new;
end;
$$;

-- create_warta (0022): same signature-change reasoning as
-- update_peribadahan_item above.
drop function if exists public.create_warta(text, date, text, text, text, text, text, text);

create function public.create_warta(
  p_slug text,
  p_tanggal_kebaktian date,
  p_judul_kebaktian text,
  p_tema_kebaktian text default null,
  p_renungan_judul text default null,
  p_renungan_kitab text default null,
  p_renungan_isi text default null,
  p_renungan_sumber text default null,
  p_renungan_ayat text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.has_permission(auth.uid(), 'warta', 'create') then
    raise exception using errcode = '42501', message = 'Kamu tidak punya akses untuk tindakan ini.';
  end if;
  if p_tanggal_kebaktian is null then
    raise exception using errcode = '22023', message = 'Tanggal Kebaktian wajib diisi.';
  end if;
  if coalesce(btrim(p_judul_kebaktian), '') = '' then
    raise exception using errcode = '22023', message = 'Judul Kebaktian wajib diisi.';
  end if;
  if coalesce(btrim(p_slug), '') = '' then
    raise exception using errcode = '22023', message = 'Slug tidak valid.';
  end if;

  insert into public.warta (
    slug, status, tanggal_kebaktian, judul_kebaktian, tema_kebaktian,
    renungan_judul, renungan_kitab, renungan_ayat, renungan_isi, renungan_sumber, created_by
  )
  values (
    p_slug, 'draft', p_tanggal_kebaktian, p_judul_kebaktian, p_tema_kebaktian,
    p_renungan_judul, p_renungan_kitab, p_renungan_ayat, p_renungan_isi, p_renungan_sumber, auth.uid()
  )
  returning id into v_id;

  insert into public.warta_litbang_items (warta_id, litbang_category_id, name, deskripsi, sort_order)
  select v_id, c.id, c.name, c.deskripsi, c.sort_order
  from public.litbang_categories c
  where c.active;

  return v_id;
end;
$$;

revoke all on function public.create_warta(text, date, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.create_warta(text, date, text, text, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. warta_pujian: per-warta ordered list (brief §16.1)
-- ---------------------------------------------------------------------------

create table public.warta_pujian (
  id uuid primary key default gen_random_uuid(),
  warta_id uuid not null references public.warta (id) on delete cascade,
  urutan int not null default 0,
  buku text not null constraint warta_pujian_buku_check check (buku in ('KJ', 'PKJ', 'NKB', 'Lainnya')),
  nomor text constraint warta_pujian_nomor_check check (nomor is null or char_length(nomor) <= 20),
  keterangan text constraint warta_pujian_keterangan_check check (keterangan is null or char_length(keterangan) <= 200),
  created_at timestamptz not null default now()
);

create index warta_pujian_warta_id_idx on public.warta_pujian (warta_id);

alter table public.warta_pujian enable row level security;

-- Same shape as warta_litbang_items/warta_kesaksian_items (0003): public
-- read only through a published parent, warta:read otherwise. Unlike those
-- two, writes need only warta:update (the explicit instruction for this
-- stage) — there is no snapshot-at-create step that would also need
-- warta:create.
create policy "warta_pujian_select" on public.warta_pujian
  for select using (
    exists (select 1 from public.warta w where w.id = warta_id and w.status = 'published')
    or public.has_permission(auth.uid(), 'warta', 'read')
  );

create policy "warta_pujian_write" on public.warta_pujian
  for all
  using (public.has_permission(auth.uid(), 'warta', 'update'))
  with check (public.has_permission(auth.uid(), 'warta', 'update'));

grant select on public.warta_pujian to anon;

-- Atomic reorder, scoped to one warta (unlike reorder_litbang_categories and
-- friends, which reorder a whole global table): p_ids must be exactly the
-- current set of rows for p_warta_id, or nothing changes.
create function public.reorder_warta_pujian(p_warta_id uuid, p_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ids uuid[] := coalesce(p_ids, '{}');
begin
  if not public.has_permission(auth.uid(), 'warta', 'update') then
    raise exception using errcode = '42501', message = 'Kamu tidak punya akses untuk tindakan ini.';
  end if;
  if (select count(distinct x.id) from unnest(v_ids) as x (id)) <> cardinality(v_ids)
    or (select count(*) from public.warta_pujian where warta_id = p_warta_id) <> cardinality(v_ids)
    or exists (
      select 1 from unnest(v_ids) as x (id)
      where not exists (select 1 from public.warta_pujian p where p.id = x.id and p.warta_id = p_warta_id)
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Daftar pujian sudah berubah. Muat ulang halaman lalu coba lagi.';
  end if;

  update public.warta_pujian p
  set urutan = o.ord - 1
  from unnest(v_ids) with ordinality as o (id, ord)
  where p.id = o.id
    and p.warta_id = p_warta_id
    and p.urutan is distinct from o.ord - 1;
end;
$$;

revoke all on function public.reorder_warta_pujian(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_warta_pujian(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Profil Gereja: Jadwal Kebaktian Rutin, website, telepon sekretariat
-- ---------------------------------------------------------------------------

alter table public.profil_gereja
  add column website_url text,
  add column telepon_sekretariat text;

alter table public.profil_gereja
  add constraint profil_gereja_website_url_check check (
    website_url is null or (char_length(website_url) <= 500 and website_url ~ '^https://[^[:space:][:cntrl:]"<>\\]+$')
  ),
  add constraint profil_gereja_telepon_sekretariat_check check (
    telepon_sekretariat is null or telepon_sekretariat ~ '^[0-9]{8,15}$'
  );

create table public.profil_gereja_jadwal_rutin (
  id uuid primary key default gen_random_uuid(),
  nama text not null constraint profil_gereja_jadwal_rutin_nama_check check (btrim(nama) <> '' and char_length(nama) <= 200),
  -- e.g. "Minggu, pkl. 08.00 WIB" (brief §16.1).
  keterangan_waktu text not null
    constraint profil_gereja_jadwal_rutin_keterangan_waktu_check check (btrim(keterangan_waktu) <> '' and char_length(keterangan_waktu) <= 200),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.profil_gereja_jadwal_rutin enable row level security;
revoke all on public.profil_gereja_jadwal_rutin from anon;

create policy profil_gereja_jadwal_rutin_select on public.profil_gereja_jadwal_rutin
  for select to authenticated
  using (public.has_permission(auth.uid(), 'situs', 'read'));
create policy profil_gereja_jadwal_rutin_insert on public.profil_gereja_jadwal_rutin
  for insert to authenticated
  with check (public.has_permission(auth.uid(), 'situs', 'create'));
create policy profil_gereja_jadwal_rutin_update on public.profil_gereja_jadwal_rutin
  for update to authenticated
  using (public.has_permission(auth.uid(), 'situs', 'update'))
  with check (public.has_permission(auth.uid(), 'situs', 'update'));
create policy profil_gereja_jadwal_rutin_delete on public.profil_gereja_jadwal_rutin
  for delete to authenticated
  using (public.has_permission(auth.uid(), 'situs', 'delete'));

-- Same contract as reorder_profil_linimasa (0029): a global, not per-parent,
-- ordered list.
create function public.reorder_jadwal_rutin(p_ids uuid[])
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
    or (select count(*) from public.profil_gereja_jadwal_rutin) <> cardinality(v_ids)
    or exists (
      select 1 from unnest(v_ids) as x (id)
      where not exists (select 1 from public.profil_gereja_jadwal_rutin j where j.id = x.id)
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Daftar jadwal rutin sudah berubah. Muat ulang halaman lalu coba lagi.';
  end if;

  update public.profil_gereja_jadwal_rutin j
  set sort_order = o.ord - 1
  from unnest(v_ids) with ordinality as o (id, ord)
  where j.id = o.id
    and j.sort_order is distinct from o.ord - 1;
end;
$$;

revoke all on function public.reorder_jadwal_rutin(uuid[]) from public, anon;
grant execute on function public.reorder_jadwal_rutin(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Pendeta: no_hp (never public) + tampil_di_warta
-- ---------------------------------------------------------------------------

alter table public.pendeta
  add column no_hp text constraint pendeta_no_hp_check check (no_hp is null or no_hp ~ '^[0-9]{8,15}$'),
  add column tampil_di_warta boolean not null default true;

comment on column public.pendeta.no_hp is
  'Digits only. Never selected by public_pendeta() or any other public-facing function — admin and Warta DOCX only (brief §16.1).';
