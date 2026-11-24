-- Stage 14b: Pemilihan, the panitia's side (brief §18.4, §18.5).
--
-- 1. pemilihan_peserta gains kelompok_wilayah (the sheet the row came from,
--    information only), keterangan (every row), and
--    alasan_tidak_dapat_dipilih (Usia + Keterangan, only for rows that may
--    not be chosen). Shown to the panitia only, never in the portal.
-- 2. pemilihan_impor_baris: every row of the last import, with how it
--    matched (cocok / ambigu / tidak_ditemukan / error) and what the panitia
--    decided. A row is "beres" once it is left out, or has a jemaat and
--    known dapat_memilih / dapat_dipilih values with no open warning. Every
--    beres row that isn't left out is a pemilihan_peserta row; the import
--    and resolution functions keep the two in step, atomically.
--    The rules that decide a row's values live here, not in the app:
--    Dapat Dipilih and Tidak Dapat Dipilih must have exactly one tick, and a
--    blank Dapat Memilih needs the panitia's confirmation.
-- 3. The election can't open while any imported row isn't beres
--    (private.pemilihan_guard redefined, otherwise as in 0038).
-- 4. Functions for the panitia's pages (SECURITY DEFINER, empty
--    search_path, executable by authenticated only). The panitia role holds
--    no warta:read, so it can't read jemaat or profiles directly; these
--    return only what the pages need.
-- 5. The Roles & Permissions editor's scope (set_role_ui_permissions) gains
--    pemilihan, pemilihan_hasil, and pemilihan_bantu, together with the
--    app's VISIBLE_RESOURCES (see 0038's note).
--
-- Nothing here touches pemilihan_partisipasi or pemilihan_suara except
-- reads that return counts or the "not voted yet" list for assisted voting
-- (brief §18.5; docs/pemilihan-kerahasiaan.md, "Siapa melihat apa").

-- ---------------------------------------------------------------------------
-- 1. pemilihan_peserta: import details
-- ---------------------------------------------------------------------------

alter table public.pemilihan_peserta
  add column kelompok_wilayah text,
  add column keterangan text,
  add column alasan_tidak_dapat_dipilih text,
  add constraint pemilihan_peserta_kelompok_wilayah_check
    check (kelompok_wilayah is null or (btrim(kelompok_wilayah) <> '' and char_length(kelompok_wilayah) <= 100)),
  add constraint pemilihan_peserta_keterangan_check
    check (keterangan is null or (btrim(keterangan) <> '' and char_length(keterangan) <= 500)),
  add constraint pemilihan_peserta_alasan_check
    check (
      alasan_tidak_dapat_dipilih is null
      or (not dapat_dipilih and btrim(alasan_tidak_dapat_dipilih) <> '' and char_length(alasan_tidak_dapat_dipilih) <= 600)
    );

comment on column public.pemilihan_peserta.kelompok_wilayah is
  'The sheet (or file) the row was imported from. Information only; it decides nothing.';
comment on column public.pemilihan_peserta.alasan_tidak_dapat_dipilih is
  'Usia and Keterangan from the import, for rows that may not be chosen. Panitia only, never in the portal.';

-- ---------------------------------------------------------------------------
-- 2. The import rows
-- ---------------------------------------------------------------------------

create table public.pemilihan_impor_baris (
  id uuid primary key default gen_random_uuid(),
  pemilihan_id uuid not null references public.pemilihan (id) on delete cascade,
  -- Position in the import (files, then sheets, then rows).
  urutan int not null,
  -- File name, sheet name, and the row number in that sheet, for messages.
  sumber text not null,
  kelompok_wilayah text not null,
  baris int not null,
  nomor text,
  nama text not null,
  domisili text,
  -- The cells as read: 'ya', 'tidak' (an explicit no), 'kosong', or
  -- 'tidak_dikenal' (anything else, never guessed).
  tanda_memilih text not null,
  tanda_dipilih text not null,
  tanda_tidak_dipilih text not null,
  usia text,
  keterangan text,
  -- How the row matched when imported; it fixes the preview's group.
  kategori text not null,
  -- The jemaat the name could be, best first (Domisili as the hint).
  calon_jemaat_ids uuid[] not null default '{}',
  -- Information found while reading (e.g. a skipped number).
  catatan text[] not null default '{}',
  -- The jemaat this row is. Set by a unique match, or picked by the panitia.
  jemaat_id uuid references public.jemaat (id) on delete set null,
  -- Derived from the ticks on import; the panitia may correct them.
  dapat_memilih boolean,
  dapat_dipilih boolean,
  perlu_konfirmasi_memilih boolean not null default false,
  dikeluarkan boolean not null default false,
  beres boolean generated always as (
    dikeluarkan
    or (jemaat_id is not null and dapat_memilih is not null and dapat_dipilih is not null and not perlu_konfirmasi_memilih)
  ) stored,

  constraint pemilihan_impor_baris_urutan_key unique (pemilihan_id, urutan),
  constraint pemilihan_impor_baris_tanda_check check (
    tanda_memilih in ('ya', 'tidak', 'kosong', 'tidak_dikenal')
    and tanda_dipilih in ('ya', 'tidak', 'kosong', 'tidak_dikenal')
    and tanda_tidak_dipilih in ('ya', 'tidak', 'kosong', 'tidak_dikenal')
  ),
  constraint pemilihan_impor_baris_kategori_check
    check (kategori in ('cocok', 'ambigu', 'tidak_ditemukan', 'error')),
  constraint pemilihan_impor_baris_teks_check check (
    btrim(sumber) <> '' and char_length(sumber) <= 300
    and btrim(kelompok_wilayah) <> '' and char_length(kelompok_wilayah) <= 100
    and btrim(nama) <> '' and char_length(nama) <= 200
    and baris >= 1 and urutan >= 1
    and (nomor is null or char_length(nomor) <= 20)
    and (domisili is null or char_length(domisili) <= 300)
    and (usia is null or char_length(usia) <= 20)
    and (keterangan is null or (btrim(keterangan) <> '' and char_length(keterangan) <= 500))
    and cardinality(calon_jemaat_ids) <= 50
    and cardinality(catatan) <= 10
  ),
  -- A blank Dapat Memilih is "no, pending confirmation".
  constraint pemilihan_impor_baris_konfirmasi_check
    check (not perlu_konfirmasi_memilih or dapat_memilih = false)
);

comment on table public.pemilihan_impor_baris is
  'Every row of an election''s last peserta import and how it was resolved (brief §18.4). Written only by impor_peserta_pemilihan / perbarui_baris_impor, and only while the election is draft.';

-- One jemaat appears at most once in an import (rows left out don't count).
create unique index pemilihan_impor_baris_jemaat_key
  on public.pemilihan_impor_baris (pemilihan_id, jemaat_id)
  where jemaat_id is not null and not dikeluarkan;

create index pemilihan_impor_baris_jemaat_idx on public.pemilihan_impor_baris (jemaat_id);

-- Draft only, like pemilihan_peserta (the same guard: it locks the election
-- row FOR SHARE so a change can't race an opening).
create trigger pemilihan_impor_baris_guard
  before insert or update or delete on public.pemilihan_impor_baris
  for each row execute function private.pemilihan_peserta_guard();

alter table public.pemilihan_impor_baris enable row level security;
revoke all on public.pemilihan_impor_baris from public, anon, authenticated, service_role;
grant select on public.pemilihan_impor_baris to authenticated;

create policy pemilihan_impor_baris_select on public.pemilihan_impor_baris
  for select to authenticated
  using (public.has_permission(auth.uid(), 'pemilihan', 'read'));

-- The peserta row an imported row stands for.
create or replace function private.pemilihan_impor_ke_peserta(r public.pemilihan_impor_baris)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.pemilihan_peserta (
    pemilihan_id, jemaat_id, nama_tampilan, dapat_memilih, dapat_dipilih,
    kelompok_wilayah, keterangan, alasan_tidak_dapat_dipilih
  ) values (
    r.pemilihan_id, r.jemaat_id, r.nama, r.dapat_memilih, r.dapat_dipilih,
    r.kelompok_wilayah, r.keterangan,
    case when not r.dapat_dipilih then
      nullif(concat_ws('; ', case when r.usia is not null then 'Usia ' || r.usia end, r.keterangan), '')
    end
  );
end;
$$;

revoke all on function private.pemilihan_impor_ke_peserta(public.pemilihan_impor_baris) from public, anon, authenticated, service_role;

-- Replaces an election's whole peserta list with a new import, atomically
-- (brief §18.4). p_baris is a JSON array of rows as the app read them:
-- sumber, kelompok_wilayah, baris, nomor, nama, domisili, tanda_memilih,
-- tanda_dipilih, tanda_tidak_dipilih, usia, keterangan, kategori,
-- calon_jemaat_ids, catatan, jemaat_id. dapat_memilih / dapat_dipilih are
-- derived here from the ticks, never taken from the caller.
create or replace function public.impor_peserta_pemilihan(p_pemilihan_id uuid, p_baris jsonb)
returns table (jumlah_baris int, jumlah_beres int, jumlah_peserta int)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_n int;
  v_constraint text;
  v_row public.pemilihan_impor_baris;
begin
  if not public.has_permission(auth.uid(), 'pemilihan', 'update') then
    raise exception using errcode = '42501', message = 'Kamu tidak punya akses untuk tindakan ini.';
  end if;

  -- FOR UPDATE: an opening (or another import) waits for this one.
  select pm.status into v_status from public.pemilihan pm where pm.id = p_pemilihan_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Pemilihan tidak ditemukan.';
  end if;
  if v_status <> 'draft' then
    raise exception using errcode = 'PM010', message = 'Daftar peserta tidak bisa diubah setelah pemilihan dibuka.';
  end if;

  if p_baris is null or jsonb_typeof(p_baris) <> 'array' then
    raise exception using errcode = '22023', message = 'Data impor tidak valid.';
  end if;
  v_n := jsonb_array_length(p_baris);
  if v_n = 0 then
    raise exception using errcode = '22023', message = 'Tidak ada baris peserta untuk diimpor.';
  end if;
  if v_n > 5000 then
    raise exception using errcode = '22023', message = 'Maksimal 5000 baris peserta sekali impor.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_baris) as e (v) where jsonb_typeof(e.v) <> 'object') then
    raise exception using errcode = '22023', message = 'Data impor tidak valid.';
  end if;

  delete from public.pemilihan_peserta pp where pp.pemilihan_id = p_pemilihan_id;
  delete from public.pemilihan_impor_baris b where b.pemilihan_id = p_pemilihan_id;

  begin
    insert into public.pemilihan_impor_baris (
      pemilihan_id, urutan, sumber, kelompok_wilayah, baris, nomor, nama, domisili,
      tanda_memilih, tanda_dipilih, tanda_tidak_dipilih, usia, keterangan,
      kategori, calon_jemaat_ids, catatan, jemaat_id,
      dapat_memilih, perlu_konfirmasi_memilih, dapat_dipilih
    )
    select
      p_pemilihan_id,
      e.i::int,
      x.sumber,
      x.kelompok_wilayah,
      x.baris,
      nullif(btrim(x.nomor), ''),
      regexp_replace(btrim(x.nama), '[[:space:]]+', ' ', 'g'),
      nullif(btrim(x.domisili), ''),
      x.tanda_memilih,
      x.tanda_dipilih,
      x.tanda_tidak_dipilih,
      nullif(btrim(x.usia), ''),
      nullif(btrim(x.keterangan), ''),
      x.kategori,
      coalesce(x.calon_jemaat_ids, '{}'),
      coalesce(x.catatan, '{}'),
      x.jemaat_id,
      case x.tanda_memilih when 'ya' then true when 'tidak' then false when 'kosong' then false end,
      x.tanda_memilih = 'kosong',
      case
        when x.tanda_dipilih = 'ya' and x.tanda_tidak_dipilih in ('kosong', 'tidak') then true
        when x.tanda_tidak_dipilih = 'ya' and x.tanda_dipilih in ('kosong', 'tidak') then false
      end
    from jsonb_array_elements(p_baris) with ordinality as e (v, i)
    cross join lateral jsonb_to_record(e.v) as x (
      sumber text, kelompok_wilayah text, baris int, nomor text, nama text, domisili text,
      tanda_memilih text, tanda_dipilih text, tanda_tidak_dipilih text, usia text, keterangan text,
      kategori text, calon_jemaat_ids uuid[], catatan text[], jemaat_id uuid
    );
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'pemilihan_impor_baris_jemaat_key' then
        raise exception using
          errcode = '23505', message = 'Satu jemaat hanya boleh muncul sekali di daftar peserta. Ada jemaat yang dicocokkan ke lebih dari satu baris.';
      end if;
      raise exception using errcode = '22023', message = 'Data impor tidak valid.';
    when foreign_key_violation then
      raise exception using errcode = '22023', message = 'Ada jemaat yang tidak ditemukan. Muat ulang halaman, lalu impor lagi.';
    when check_violation or not_null_violation or invalid_text_representation
      or invalid_parameter_value or datatype_mismatch or numeric_value_out_of_range then
      raise exception using errcode = '22023', message = 'Data impor tidak valid.';
  end;

  -- A unique match must name one of its own candidates.
  if exists (
    select 1 from public.pemilihan_impor_baris b
    where b.pemilihan_id = p_pemilihan_id
      and b.jemaat_id is not null
      and b.kategori <> 'tidak_ditemukan'
      and not (b.jemaat_id = any (b.calon_jemaat_ids))
  ) then
    raise exception using errcode = '22023', message = 'Data impor tidak valid.';
  end if;

  for v_row in
    select * from public.pemilihan_impor_baris b
    where b.pemilihan_id = p_pemilihan_id and b.beres and not b.dikeluarkan
    order by b.urutan
  loop
    perform private.pemilihan_impor_ke_peserta(v_row);
  end loop;

  return query
    select
      count(*)::int,
      (count(*) filter (where b.beres))::int,
      (select count(*)::int from public.pemilihan_peserta pp where pp.pemilihan_id = p_pemilihan_id)
    from public.pemilihan_impor_baris b
    where b.pemilihan_id = p_pemilihan_id;
end;
$$;

-- The panitia resolves one imported row: picks its jemaat, corrects
-- dapat_memilih / dapat_dipilih (which also confirms a blank Dapat
-- Memilih), or leaves it out / takes it back. A null argument leaves that
-- field as it is. The matching peserta row follows in the same transaction.
create or replace function public.perbarui_baris_impor(
  p_baris_id uuid,
  p_jemaat_id uuid default null,
  p_dapat_memilih boolean default null,
  p_dapat_dipilih boolean default null,
  p_dikeluarkan boolean default null
)
returns setof public.pemilihan_impor_baris
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_lama public.pemilihan_impor_baris;
  v_baru public.pemilihan_impor_baris;
  v_status text;
  v_constraint text;
begin
  if not public.has_permission(auth.uid(), 'pemilihan', 'update') then
    raise exception using errcode = '42501', message = 'Kamu tidak punya akses untuk tindakan ini.';
  end if;

  select * into v_lama from public.pemilihan_impor_baris b where b.id = p_baris_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Baris impor tidak ditemukan.';
  end if;
  select pm.status into v_status from public.pemilihan pm where pm.id = v_lama.pemilihan_id for update;
  if v_status <> 'draft' then
    raise exception using errcode = 'PM010', message = 'Daftar peserta tidak bisa diubah setelah pemilihan dibuka.';
  end if;
  -- Re-read under the election lock.
  select * into v_lama from public.pemilihan_impor_baris b where b.id = p_baris_id;

  if p_jemaat_id is not null and not exists (select 1 from public.jemaat j where j.id = p_jemaat_id) then
    raise exception using errcode = 'P0002', message = 'Jemaat tidak ditemukan.';
  end if;

  if v_lama.beres and not v_lama.dikeluarkan then
    delete from public.pemilihan_peserta pp
    where pp.pemilihan_id = v_lama.pemilihan_id and pp.jemaat_id = v_lama.jemaat_id;
  end if;

  begin
    update public.pemilihan_impor_baris b set
      jemaat_id = coalesce(p_jemaat_id, b.jemaat_id),
      dapat_memilih = coalesce(p_dapat_memilih, b.dapat_memilih),
      perlu_konfirmasi_memilih = case when p_dapat_memilih is not null then false else b.perlu_konfirmasi_memilih end,
      dapat_dipilih = coalesce(p_dapat_dipilih, b.dapat_dipilih),
      dikeluarkan = coalesce(p_dikeluarkan, b.dikeluarkan)
    where b.id = p_baris_id
    returning * into v_baru;

    if v_baru.beres and not v_baru.dikeluarkan then
      perform private.pemilihan_impor_ke_peserta(v_baru);
    end if;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'pemilihan_peserta_pkey' then
      raise exception using errcode = '23505', message = 'Jemaat ini sudah ada di daftar peserta.';
    end if;
    raise exception using
      errcode = '23505', message = 'Jemaat ini sudah dipakai di baris lain. Satu jemaat hanya boleh muncul sekali.';
  end;

  return next v_baru;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Opening needs every imported row resolved
-- ---------------------------------------------------------------------------

-- Same as 0038, plus: no imported row may still be unresolved when opening.
create or replace function private.pemilihan_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_calon int;
  v_kontes record;
  v_belum int;
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception using errcode = 'PM010', message = 'Pemilihan yang sudah dibuka tidak bisa dihapus.';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.status is distinct from 'draft' then
      raise exception using errcode = 'PM011', message = 'Pemilihan baru harus berstatus draft.';
    end if;
    new.dibuka_oleh := null;
    new.waktu_dibuka := null;
    new.ditutup_oleh := null;
    new.waktu_ditutup := null;
    new.diumumkan_oleh := null;
    new.waktu_diumumkan := null;
    new.created_by := auth.uid();
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  -- UPDATE. The stamps are written below and never by hand; an account
  -- deletion may still clear the *_oleh / created_by references.
  if new.id <> old.id
    or new.created_at <> old.created_at
    or new.waktu_dibuka is distinct from old.waktu_dibuka
    or new.waktu_ditutup is distinct from old.waktu_ditutup
    or new.waktu_diumumkan is distinct from old.waktu_diumumkan
    or (new.created_by is distinct from old.created_by and new.created_by is not null)
    or (new.dibuka_oleh is distinct from old.dibuka_oleh and new.dibuka_oleh is not null)
    or (new.ditutup_oleh is distinct from old.ditutup_oleh and new.ditutup_oleh is not null)
    or (new.diumumkan_oleh is distinct from old.diumumkan_oleh and new.diumumkan_oleh is not null)
  then
    raise exception using
      errcode = 'PM010',
      message = 'Waktu dan pencatat perubahan status diisi otomatis dan tidak bisa diubah.';
  end if;

  if old.status <> 'draft'
    and (new.nama, new.periode, new.dibuka_pada, new.ditutup_pada)
      is distinct from (old.nama, old.periode, old.dibuka_pada, old.ditutup_pada)
  then
    raise exception using
      errcode = 'PM010',
      message = 'Pemilihan yang sudah dibuka tidak bisa diubah. Yang masih bisa diatur hanya tampilkan hasil saat berjalan.';
  end if;

  if new.status is distinct from old.status then
    if (old.status, new.status) not in (('draft', 'dibuka'), ('dibuka', 'ditutup'), ('ditutup', 'diumumkan')) then
      raise exception using
        errcode = 'PM011',
        message = format('Status pemilihan tidak bisa diubah dari "%s" ke "%s".', old.status, new.status);
    end if;

    if new.status = 'dibuka' then
      if new.dibuka_pada is null or new.ditutup_pada is null then
        raise exception using
          errcode = 'PM011', message = 'Atur jadwal dibuka dan ditutup sebelum membuka pemilihan.';
      end if;
      if new.ditutup_pada <= now() then
        raise exception using
          errcode = 'PM011', message = 'Jadwal ditutup sudah lewat. Ubah jadwalnya sebelum membuka pemilihan.';
      end if;
      select count(*)::int into v_belum
      from public.pemilihan_impor_baris b
      where b.pemilihan_id = new.id and not b.beres;
      if v_belum > 0 then
        raise exception using
          errcode = 'PM011',
          message = format('Masih ada %s baris impor peserta yang belum beres. Selesaikan dulu sebelum membuka pemilihan.', v_belum);
      end if;
      if not exists (
        select 1 from public.pemilihan_peserta pp where pp.pemilihan_id = new.id and pp.dapat_memilih
      ) then
        raise exception using errcode = 'PM011', message = 'Belum ada peserta yang dapat memilih.';
      end if;
      select count(*)::int into v_calon
      from public.pemilihan_peserta pp
      where pp.pemilihan_id = new.id and pp.dapat_dipilih;
      for v_kontes in select k.nama, k.min_pilih from public.pemilihan_kontes k order by k.urutan loop
        if v_calon < v_kontes.min_pilih then
          raise exception using
            errcode = 'PM011',
            message = format(
              'Calon yang dapat dipilih baru %s orang, padahal %s minimal %s pilihan.',
              v_calon, v_kontes.nama, v_kontes.min_pilih
            );
        end if;
      end loop;
      new.dibuka_oleh := auth.uid();
      new.waktu_dibuka := now();
    elsif new.status = 'ditutup' then
      new.ditutup_oleh := auth.uid();
      new.waktu_ditutup := now();
    else
      new.diumumkan_oleh := auth.uid();
      new.waktu_diumumkan := now();
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Reads for the panitia's pages
-- ---------------------------------------------------------------------------

-- How an account is named on the panitia's pages.
create or replace function private.pemilihan_nama_akun(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(btrim(pr.full_name), ''), pr.username::text, pr.email)
  from public.profiles pr
  where pr.id = p_user_id;
$$;

revoke all on function private.pemilihan_nama_akun(uuid) from public, anon, authenticated, service_role;

-- /admin/pemilihan (pemilihan:read): per election, its voters, how many
-- voted, the percentage, and how many imported rows are still unresolved.
create or replace function public.pemilihan_ringkasan()
returns table (
  pemilihan_id uuid,
  total_pemilih int,
  sudah_memilih int,
  persen numeric,
  baris_belum_beres int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_permission(auth.uid(), 'pemilihan', 'read') then
    raise exception using errcode = '42501', message = 'Kamu tidak punya akses untuk tindakan ini.';
  end if;
  return query
    select
      pm.id,
      c.pemilih,
      c.sudah,
      case when c.pemilih = 0 then 0::numeric else round(100.0 * c.sudah / c.pemilih, 1) end,
      c.belum
    from public.pemilihan pm
    cross join lateral (
      select
        (select count(*)::int from public.pemilihan_peserta pp where pp.pemilihan_id = pm.id and pp.dapat_memilih) as pemilih,
        (select count(*)::int from public.pemilihan_partisipasi pt where pt.pemilihan_id = pm.id) as sudah,
        (select count(*)::int from public.pemilihan_impor_baris b where b.pemilihan_id = pm.id and not b.beres) as belum
    ) as c;
end;
$$;

-- Who created, opened, closed, and announced an election, by name, for the
-- detail page and the berita acara (pemilihan:read).
create or replace function public.pemilihan_pencatat(p_pemilihan_id uuid)
returns table (dibuat_oleh text, dibuka_oleh text, ditutup_oleh text, diumumkan_oleh text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_permission(auth.uid(), 'pemilihan', 'read') then
    raise exception using errcode = '42501', message = 'Kamu tidak punya akses untuk tindakan ini.';
  end if;
  return query
    select
      private.pemilihan_nama_akun(pm.created_by),
      private.pemilihan_nama_akun(pm.dibuka_oleh),
      private.pemilihan_nama_akun(pm.ditutup_oleh),
      private.pemilihan_nama_akun(pm.diumumkan_oleh)
    from public.pemilihan pm
    where pm.id = p_pemilihan_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Pemilihan tidak ditemukan.';
  end if;
end;
$$;

-- The jemaat list the import matches against and the panitia picks from
-- (pemilihan:update): name, address, and wilayah (Domisili's hint).
create or replace function public.pemilihan_daftar_jemaat()
returns table (id uuid, nama text, alamat text, wilayah text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_permission(auth.uid(), 'pemilihan', 'update') then
    raise exception using errcode = '42501', message = 'Kamu tidak punya akses untuk tindakan ini.';
  end if;
  return query
    select j.id, j.nama, j.alamat, w.nama
    from public.jemaat j
    left join public.wilayah w on w.id = j.wilayah_id
    order by j.nama, j.id;
end;
$$;

-- Each peserta's Portal Jemaat account (pemilihan:read), for "dapat memilih
-- tapi belum punya akun" and the panitia's "Reset Password": the account
-- id and username only for a jemaat-only account (no role), the only kind
-- the panitia may reset (siapkan_reset_password, 0039). Never an email.
create or replace function public.pemilihan_peserta_akun(p_pemilihan_id uuid)
returns table (jemaat_id uuid, punya_akun boolean, akun_jemaat_id uuid, username text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_permission(auth.uid(), 'pemilihan', 'read') then
    raise exception using errcode = '42501', message = 'Kamu tidak punya akses untuk tindakan ini.';
  end if;
  return query
    select
      pp.jemaat_id,
      pr.id is not null,
      case when pr.id is not null and not exists (select 1 from public.user_roles ur where ur.user_id = pr.id) then pr.id end,
      case when pr.id is not null and not exists (select 1 from public.user_roles ur where ur.user_id = pr.id) then pr.username::text end
    from public.pemilihan_peserta pp
    left join public.profiles pr on pr.jemaat_id = pp.jemaat_id
    where pp.pemilihan_id = p_pemilihan_id;
end;
$$;

-- For "Buat akun username" by the panitia (pemilihan:update): per jemaat,
-- its name, whether it already has an account, and whether it is a voter
-- (dapat_memilih) of an election that is still draft or dibuka. The app
-- creates accounts only for voters without one.
create or replace function public.pemilihan_jemaat_akun(p_jemaat_ids uuid[])
returns table (jemaat_id uuid, nama text, punya_akun boolean, pemilih boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_permission(auth.uid(), 'pemilihan', 'update') then
    raise exception using errcode = '42501', message = 'Kamu tidak punya akses untuk tindakan ini.';
  end if;
  return query
    select
      j.id,
      j.nama,
      exists (select 1 from public.profiles pr where pr.jemaat_id = j.id),
      exists (
        select 1 from public.pemilihan_peserta pp
        join public.pemilihan pm on pm.id = pp.pemilihan_id
        where pp.jemaat_id = j.id and pp.dapat_memilih and pm.status in ('draft', 'dibuka')
      )
    from public.jemaat j
    where j.id = any (coalesce(p_jemaat_ids, '{}'));
end;
$$;

-- An election's candidates by name, for the assisted ballot (pemilihan:read
-- or pemilihan_bantu:create). Same order as portal.kandidat.
create or replace function public.pemilihan_kandidat_admin(p_pemilihan_id uuid)
returns table (jemaat_id uuid, nama_tampilan text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.has_permission(auth.uid(), 'pemilihan', 'read')
    or public.has_permission(auth.uid(), 'pemilihan_bantu', 'create')) then
    raise exception using errcode = '42501', message = 'Kamu tidak punya akses untuk tindakan ini.';
  end if;
  if not exists (select 1 from public.pemilihan pm where pm.id = p_pemilihan_id) then
    raise exception using errcode = 'P0002', message = 'Pemilihan tidak ditemukan.';
  end if;
  return query
    select pp.jemaat_id, pp.nama_tampilan
    from public.pemilihan_peserta pp
    where pp.pemilihan_id = p_pemilihan_id and pp.dapat_dipilih
    order by private.pemilihan_kunci_nama(pp.nama_tampilan), pp.nama_tampilan, pp.jemaat_id;
end;
$$;

-- The election as the assisted-voting page shows it (pemilihan_bantu:create,
-- which needs no pemilihan:read).
create or replace function public.pemilihan_untuk_bantu(p_pemilihan_id uuid)
returns table (id uuid, nama text, periode text, status text, dibuka_pada timestamptz, ditutup_pada timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_permission(auth.uid(), 'pemilihan_bantu', 'create') then
    raise exception using errcode = '42501', message = 'Kamu tidak punya akses untuk tindakan ini.';
  end if;
  return query
    select pm.id, pm.nama, pm.periode, pm.status, pm.dibuka_pada, pm.ditutup_pada
    from public.pemilihan pm
    where pm.id = p_pemilihan_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Pemilihan tidak ditemukan.';
  end if;
end;
$$;

-- Voters the panitia may assist (brief §18.5): dapat_memilih, not voted
-- yet, and not the panitia's own jemaat record. Only while dibuka. Names
-- only: never anything about a vote.
create or replace function public.pemilihan_belum_memilih(p_pemilihan_id uuid)
returns table (jemaat_id uuid, nama_tampilan text, kelompok_wilayah text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if not public.has_permission(auth.uid(), 'pemilihan_bantu', 'create') then
    raise exception using errcode = '42501', message = 'Kamu tidak punya akses untuk tindakan ini.';
  end if;
  select pm.status into v_status from public.pemilihan pm where pm.id = p_pemilihan_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Pemilihan tidak ditemukan.';
  end if;
  if v_status = 'draft' then
    raise exception using errcode = 'PM001', message = 'Pemungutan suara belum dibuka.';
  end if;
  if v_status <> 'dibuka' then
    raise exception using errcode = 'PM001', message = 'Pemungutan suara sudah ditutup.';
  end if;

  return query
    select pp.jemaat_id, pp.nama_tampilan, pp.kelompok_wilayah
    from public.pemilihan_peserta pp
    where pp.pemilihan_id = p_pemilihan_id
      and pp.dapat_memilih
      and not exists (
        select 1 from public.pemilihan_partisipasi pt
        where pt.pemilihan_id = pp.pemilihan_id and pt.jemaat_id = pp.jemaat_id
      )
      and not exists (
        select 1 from public.profiles pr where pr.id = auth.uid() and pr.jemaat_id = pp.jemaat_id
      )
    order by private.pemilihan_kunci_nama(pp.nama_tampilan), pp.nama_tampilan, pp.jemaat_id;
end;
$$;

-- Executable by authenticated only, like 0038's API functions.
revoke all on function public.impor_peserta_pemilihan(uuid, jsonb) from public, anon, service_role;
revoke all on function public.perbarui_baris_impor(uuid, uuid, boolean, boolean, boolean) from public, anon, service_role;
revoke all on function public.pemilihan_ringkasan() from public, anon, service_role;
revoke all on function public.pemilihan_pencatat(uuid) from public, anon, service_role;
revoke all on function public.pemilihan_daftar_jemaat() from public, anon, service_role;
revoke all on function public.pemilihan_peserta_akun(uuid) from public, anon, service_role;
revoke all on function public.pemilihan_jemaat_akun(uuid[]) from public, anon, service_role;
revoke all on function public.pemilihan_kandidat_admin(uuid) from public, anon, service_role;
revoke all on function public.pemilihan_untuk_bantu(uuid) from public, anon, service_role;
revoke all on function public.pemilihan_belum_memilih(uuid) from public, anon, service_role;
grant execute on function public.impor_peserta_pemilihan(uuid, jsonb) to authenticated;
grant execute on function public.perbarui_baris_impor(uuid, uuid, boolean, boolean, boolean) to authenticated;
grant execute on function public.pemilihan_ringkasan() to authenticated;
grant execute on function public.pemilihan_pencatat(uuid) to authenticated;
grant execute on function public.pemilihan_daftar_jemaat() to authenticated;
grant execute on function public.pemilihan_peserta_akun(uuid) to authenticated;
grant execute on function public.pemilihan_jemaat_akun(uuid[]) to authenticated;
grant execute on function public.pemilihan_kandidat_admin(uuid) to authenticated;
grant execute on function public.pemilihan_untuk_bantu(uuid) to authenticated;
grant execute on function public.pemilihan_belum_memilih(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Roles & Permissions editor scope
-- ---------------------------------------------------------------------------

-- Same function as 0029, with the three pemilihan resources added.
create or replace function public.set_role_ui_permissions(p_role_id uuid, p_permission_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_scope constant text[] := array[
    'warta', 'users', 'roles', 'activity_log', 'situs', 'situs_rekening',
    'pemilihan', 'pemilihan_hasil', 'pemilihan_bantu'
  ];
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
