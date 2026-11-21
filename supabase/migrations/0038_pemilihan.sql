-- Stage 14a: Pemilihan Majelis Jemaat backend (brief §18.1–18.3, §18.5–18.6).
-- No UI here: 14b builds the panitia pages, 14c the ballot in the portal.
--
-- 1. Permissions pemilihan:{create,read,update,delete}, pemilihan_hasil:read,
--    pemilihan_bantu:create and the role panitia_pemilihan (§18.4, §18.5).
-- 2. pemilihan_kontes: the fixed contest config (Penatua 10–30, PPJ 5–15).
--    The limits live here and nowhere else.
-- 3. pemilihan + pemilihan_peserta, with guards: status only moves
--    draft → dibuka → ditutup → diumumkan; once out of draft only the
--    "tampilkan hasil saat berjalan" switch may change and the peserta list
--    is frozen.
-- 4. The secret ballot (§18.2): pemilihan_partisipasi records THAT someone
--    voted, pemilihan_suara WHAT was chosen, with nothing linking the two.
--    - No role reaches either table directly (no policy, every privilege
--      revoked, service_role included); only the functions below read or
--      write them, and they return counts only.
--    - Neither table has a foreign key to a row that identifies a person
--      (jemaat, pemilihan_peserta, profiles, auth.users). A foreign-key check
--      locks the referenced row, and that lock leaves the voting
--      transaction's id in the row's xmax, which anyone allowed to read the
--      table can select (viewer can read jemaat.xmax over REST). Keys to the
--      voter's row and to each chosen candidate's row would let a viewer
--      match every ballot to its voter. The only rows a vote touches besides
--      the two hidden tables are the election row and the two contest rows,
--      which are the same for every voter.
--    - Votes are final: no update, delete, or truncate.
--    docs/pemilihan-kerahasiaan.md explains what this guarantees and what
--    it does not (direct database access).
-- 5. Functions (SECURITY DEFINER, empty search_path):
--    portal.pemilihan_aktif_saya(), portal.kandidat(), portal.berikan_suara(),
--    portal.hasil_pemilihan(); public.berikan_suara_dibantu(),
--    public.hasil_partisipasi(), public.hasil_suara().
--
-- Stable error codes (SQLSTATE), for the app to map. PostgREST answers
-- these with HTTP 400; PT403/42501/P0002 keep their earlier meaning.
--   PM001 outside the voting window (not open yet, or closed)
--   PM002 not a voter of this election
--   PM003 already voted
--   PM004 too few or too many choices in a contest
--   PM005 a choice is not a candidate of this election
--   PM006 the same candidate chosen twice in one contest
--   PM007 form number already used in this election
--   PM008 a panitia assisting their own jemaat record
--   PM009 form number missing or too long
--   PM010 frozen: the election or its peserta after draft, or a vote
--   PM011 status change not allowed, or the election can't open yet

-- ---------------------------------------------------------------------------
-- 1. Permissions and role
-- ---------------------------------------------------------------------------

insert into public.permissions (resource, action, description)
select 'pemilihan', action, 'pemilihan:' || action
from unnest(array['create', 'read', 'update', 'delete']) as action
union all
select 'pemilihan_hasil', 'read', 'pemilihan_hasil:read'
union all
select 'pemilihan_bantu', 'create', 'pemilihan_bantu:create'
on conflict (resource, action) do nothing;

insert into public.roles (name, description) values
  ('panitia_pemilihan', 'Panitia Pemilihan Majelis Jemaat: mengelola pemilihan, melihat hasil, dan membantu pemilih')
on conflict (name) do nothing;

-- super_admin and panitia_pemilihan: every pemilihan permission. Nobody else.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.resource in ('pemilihan', 'pemilihan_hasil', 'pemilihan_bantu')
where r.name in ('super_admin', 'panitia_pemilihan')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Contest config
-- ---------------------------------------------------------------------------

create table public.pemilihan_kontes (
  kode text primary key,
  nama text not null,
  min_pilih int not null,
  max_pilih int not null,
  urutan int not null,

  -- portal.berikan_suara takes exactly these two contests.
  constraint pemilihan_kontes_kode_check check (kode in ('penatua', 'ppj')),
  constraint pemilihan_kontes_nama_check check (btrim(nama) <> ''),
  constraint pemilihan_kontes_batas_check check (min_pilih >= 1 and min_pilih <= max_pilih)
);

comment on table public.pemilihan_kontes is
  'The two contests of every election and their choice limits (brief §18.1). Changed only by migrations.';

insert into public.pemilihan_kontes (kode, nama, min_pilih, max_pilih, urutan) values
  ('penatua', 'Penatua (Majelis Jemaat)', 10, 30, 1),
  ('ppj', 'PPJ (Pengawas Perbendaharaan Jemaat)', 5, 15, 2);

alter table public.pemilihan_kontes enable row level security;
revoke all on public.pemilihan_kontes from anon, authenticated, service_role;
grant select on public.pemilihan_kontes to authenticated, service_role;

-- Not personal data; the ballot needs the limits.
create policy pemilihan_kontes_select on public.pemilihan_kontes
  for select to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- 3. Elections and their peserta
-- ---------------------------------------------------------------------------

create table public.pemilihan (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  periode text,
  status text not null default 'draft',
  -- The voting window: open from dibuka_pada (inclusive) to ditutup_pada
  -- (exclusive). Required before opening.
  dibuka_pada timestamptz,
  ditutup_pada timestamptz,
  -- Shows the running tallies in the Portal Jemaat while dibuka or ditutup.
  -- The only setting that may still change after draft.
  tampilkan_hasil_saat_berjalan boolean not null default false,
  -- Written by the guard trigger on each status change (berita acara, 14b).
  dibuka_oleh uuid references auth.users (id) on delete set null,
  waktu_dibuka timestamptz,
  ditutup_oleh uuid references auth.users (id) on delete set null,
  waktu_ditutup timestamptz,
  diumumkan_oleh uuid references auth.users (id) on delete set null,
  waktu_diumumkan timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint pemilihan_status_check
    check (status in ('draft', 'dibuka', 'ditutup', 'diumumkan')),
  constraint pemilihan_nama_check
    check (btrim(nama) <> '' and char_length(nama) <= 200),
  constraint pemilihan_periode_check
    check (periode is null or (btrim(periode) <> '' and char_length(periode) <= 50)),
  constraint pemilihan_jadwal_check
    check (dibuka_pada is null or ditutup_pada is null or dibuka_pada < ditutup_pada)
);

comment on table public.pemilihan is
  'Pemilihan Majelis Jemaat (brief §18). Status only moves forward; after draft only tampilkan_hasil_saat_berjalan may change.';

create index pemilihan_status_idx on public.pemilihan (status, dibuka_pada desc);

create table public.pemilihan_peserta (
  pemilihan_id uuid not null references public.pemilihan (id) on delete cascade,
  -- restrict: a jemaat on an election list can't be deleted (results keep
  -- their names, and a vote must stay countable).
  jemaat_id uuid not null references public.jemaat (id) on delete restrict,
  -- With honorific, e.g. "Bpk. …", as printed on the list.
  nama_tampilan text not null,
  dapat_memilih boolean not null default false,
  dapat_dipilih boolean not null default false,
  created_at timestamptz not null default now(),

  constraint pemilihan_peserta_pkey primary key (pemilihan_id, jemaat_id),
  constraint pemilihan_peserta_nama_check
    check (btrim(nama_tampilan) <> '' and char_length(nama_tampilan) <= 200)
);

comment on table public.pemilihan_peserta is
  'One row per jemaat per election (brief §18.1). Frozen once the election leaves draft.';

create index pemilihan_peserta_jemaat_idx on public.pemilihan_peserta (jemaat_id);

-- The sort key for a candidate list: the display name without a leading
-- honorific, so "Bpk. Yohanes" sorts under Y next to "Ibu Yuliana".
create or replace function private.pemilihan_kunci_nama(p_nama text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(regexp_replace(btrim(p_nama), '^(bpk|bapak|ibu|sdri|sdr|saudari|saudara)\.?[[:space:]]+', '', 'i'));
$$;

-- Whether the Portal Jemaat may show an election's tallies (brief §18.6):
-- always once announced, and while dibuka or ditutup if the panitia turned
-- tampilkan_hasil_saat_berjalan on.
create or replace function private.pemilihan_hasil_publik(p_status text, p_tampilkan boolean)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_status = 'diumumkan' or (coalesce(p_tampilkan, false) and p_status in ('dibuka', 'ditutup'));
$$;

revoke all on function private.pemilihan_kunci_nama(text) from public;
revoke all on function private.pemilihan_hasil_publik(text, boolean) from public;

-- pemilihan: new rows are drafts; status only moves forward and stamps who
-- and when; after draft only tampilkan_hasil_saat_berjalan may change; only
-- drafts may be deleted. Opening needs a schedule that hasn't ended, a
-- voter, and enough candidates for every contest's minimum.
create or replace function private.pemilihan_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_calon int;
  v_kontes record;
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

-- pemilihan_peserta: no change at all once the election has left draft.
-- The election row is locked FOR SHARE, so a change can't slip in while the
-- election is being opened (the opening UPDATE waits, or this waits and
-- then sees the new status). A cascade from deleting a draft election finds
-- the row already gone and passes.
create or replace function private.pemilihan_peserta_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_status text;
begin
  if tg_op = 'INSERT' then
    v_ids := array[new.pemilihan_id];
  elsif tg_op = 'DELETE' then
    v_ids := array[old.pemilihan_id];
  else
    v_ids := array[old.pemilihan_id, new.pemilihan_id];
  end if;

  for v_status in
    select pm.status from public.pemilihan pm where pm.id = any (v_ids) for share
  loop
    if v_status <> 'draft' then
      raise exception using
        errcode = 'PM010', message = 'Daftar peserta tidak bisa diubah setelah pemilihan dibuka.';
    end if;
  end loop;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.pemilihan_guard() from public;
revoke all on function private.pemilihan_peserta_guard() from public;

create trigger pemilihan_guard
  before insert or update or delete on public.pemilihan
  for each row execute function private.pemilihan_guard();

create trigger pemilihan_peserta_guard
  before insert or update or delete on public.pemilihan_peserta
  for each row execute function private.pemilihan_peserta_guard();

alter table public.pemilihan enable row level security;
alter table public.pemilihan_peserta enable row level security;
revoke all on public.pemilihan from anon, authenticated;
revoke all on public.pemilihan_peserta from anon, authenticated;
grant select, insert, update, delete on public.pemilihan to authenticated;
grant select, insert, update, delete on public.pemilihan_peserta to authenticated;

create policy pemilihan_select on public.pemilihan
  for select to authenticated
  using (public.has_permission(auth.uid(), 'pemilihan', 'read'));
create policy pemilihan_insert on public.pemilihan
  for insert to authenticated
  with check (public.has_permission(auth.uid(), 'pemilihan', 'create'));
create policy pemilihan_update on public.pemilihan
  for update to authenticated
  using (public.has_permission(auth.uid(), 'pemilihan', 'update'))
  with check (public.has_permission(auth.uid(), 'pemilihan', 'update'));
create policy pemilihan_delete on public.pemilihan
  for delete to authenticated
  using (public.has_permission(auth.uid(), 'pemilihan', 'delete'));

create policy pemilihan_peserta_select on public.pemilihan_peserta
  for select to authenticated
  using (public.has_permission(auth.uid(), 'pemilihan', 'read'));
create policy pemilihan_peserta_insert on public.pemilihan_peserta
  for insert to authenticated
  with check (public.has_permission(auth.uid(), 'pemilihan', 'update'));
create policy pemilihan_peserta_update on public.pemilihan_peserta
  for update to authenticated
  using (public.has_permission(auth.uid(), 'pemilihan', 'update'))
  with check (public.has_permission(auth.uid(), 'pemilihan', 'update'));
create policy pemilihan_peserta_delete on public.pemilihan_peserta
  for delete to authenticated
  using (public.has_permission(auth.uid(), 'pemilihan', 'update'));

-- ---------------------------------------------------------------------------
-- 4. The secret ballot
-- ---------------------------------------------------------------------------

-- THAT someone voted, never what. No foreign key to jemaat or auth.users:
-- see the header. jemaat_id is always a peserta with dapat_memilih (checked
-- when voting; the list is frozen and its jemaat can't be deleted).
-- dibantu_oleh is the panitia's auth user id, kept even if that account is
-- deleted later.
create table public.pemilihan_partisipasi (
  pemilihan_id uuid not null references public.pemilihan (id) on delete restrict,
  jemaat_id uuid not null,
  waktu timestamptz not null default now(),
  metode text not null,
  dibantu_oleh uuid,
  nomor_formulir text,

  constraint pemilihan_partisipasi_pkey primary key (pemilihan_id, jemaat_id),
  constraint pemilihan_partisipasi_metode_check check (
    (metode = 'mandiri' and dibantu_oleh is null and nomor_formulir is null)
    or (metode = 'dibantu' and dibantu_oleh is not null and nomor_formulir is not null)
  ),
  constraint pemilihan_partisipasi_nomor_formulir_check check (
    nomor_formulir is null
    or (nomor_formulir = btrim(nomor_formulir) and nomor_formulir <> '' and char_length(nomor_formulir) <= 50)
  )
);

comment on table public.pemilihan_partisipasi is
  'Who has voted (brief §18.2), never what. No direct access for any role; read only through hasil_partisipasi and the portal functions.';

-- A paper form number is used once per election, case-insensitively.
create unique index pemilihan_partisipasi_nomor_formulir_key
  on public.pemilihan_partisipasi (pemilihan_id, lower(nomor_formulir))
  where nomor_formulir is not null;

-- WHAT was chosen, never by whom: exactly these four columns. The id is a
-- random v4 uuid, so its order says nothing about when a row was written;
-- there is no timestamp, no sequence, and no index besides the primary key.
-- kandidat_jemaat_id has no foreign key: see the header.
create table public.pemilihan_suara (
  id uuid primary key default gen_random_uuid(),
  pemilihan_id uuid not null references public.pemilihan (id) on delete restrict,
  kontes text not null references public.pemilihan_kontes (kode),
  kandidat_jemaat_id uuid not null
);

comment on table public.pemilihan_suara is
  'One row per choice on a ballot (brief §18.2), with no link to the voter. No direct access for any role; tallied only by hasil_suara / portal.hasil_pemilihan.';

create or replace function private.pemilihan_final()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = 'PM010', message = 'Data pemungutan suara bersifat final: tidak bisa diubah atau dihapus.';
end;
$$;

revoke all on function private.pemilihan_final() from public;

create trigger pemilihan_final
  before update or delete on public.pemilihan_partisipasi
  for each row execute function private.pemilihan_final();
create trigger pemilihan_final_truncate
  before truncate on public.pemilihan_partisipasi
  for each statement execute function private.pemilihan_final();
create trigger pemilihan_final
  before update or delete on public.pemilihan_suara
  for each row execute function private.pemilihan_final();
create trigger pemilihan_final_truncate
  before truncate on public.pemilihan_suara
  for each statement execute function private.pemilihan_final();

-- RLS on with no policy, and no privilege for any API role. service_role
-- bypasses RLS, so its privileges go too.
alter table public.pemilihan_partisipasi enable row level security;
alter table public.pemilihan_suara enable row level security;
revoke all on public.pemilihan_partisipasi from public, anon, authenticated, service_role;
revoke all on public.pemilihan_suara from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Casting a vote
-- ---------------------------------------------------------------------------

-- The one implementation of §18.3, for the portal (mandiri) and the panitia
-- (dibantu). In order: the election exists, is dibuka and now() is inside
-- the window; the jemaat is a peserta with dapat_memilih and hasn't voted;
-- a form number isn't used yet; per contest: no duplicate, every choice a
-- candidate (dapat_dipilih) of this election, the count within the limits.
-- Then the partisipasi row, then one suara row per choice. Any error leaves
-- nothing written. Messages never name a choice.
--
-- The election row is locked FOR SHARE: closing it (an UPDATE) waits for
-- votes in flight, and a vote that started after the close sees the new
-- status. That lock is on a row every voter shares, so it identifies no one.
-- No row of a person is locked or written.
create or replace function private.pemilihan_catat_suara(
  p_pemilihan_id uuid,
  p_jemaat_id uuid,
  p_metode text,
  p_dibantu_oleh uuid,
  p_nomor_formulir text,
  p_penatua uuid[],
  p_ppj uuid[]
)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_dibantu constant boolean := p_metode = 'dibantu';
  v_waktu constant timestamptz := now();
  v_status text;
  v_dibuka timestamptz;
  v_ditutup timestamptz;
  v_kontes record;
  v_pilihan uuid[];
  v_jumlah int;
  v_constraint text;
  c_sudah constant text := case
    when p_metode = 'dibantu' then 'Pemilih ini sudah memberikan suara.'
    else 'Anda sudah memberikan suara.'
  end;
begin
  select pm.status, pm.dibuka_pada, pm.ditutup_pada into v_status, v_dibuka, v_ditutup
  from public.pemilihan pm
  where pm.id = p_pemilihan_id
  for share;
  if not found then
    raise exception using errcode = 'P0002', message = 'Pemilihan tidak ditemukan.';
  end if;
  if v_status = 'draft' or (v_status = 'dibuka' and v_waktu < v_dibuka) then
    raise exception using errcode = 'PM001', message = 'Pemungutan suara belum dibuka.';
  end if;
  if v_status <> 'dibuka' or v_waktu >= v_ditutup then
    raise exception using errcode = 'PM001', message = 'Pemungutan suara sudah ditutup.';
  end if;

  if not coalesce((
    select pp.dapat_memilih from public.pemilihan_peserta pp
    where pp.pemilihan_id = p_pemilihan_id and pp.jemaat_id = p_jemaat_id
  ), false) then
    raise exception using
      errcode = 'PM002',
      message = case
        when v_dibantu then 'Jemaat ini tidak terdaftar sebagai pemilih pada pemilihan ini.'
        else 'Anda tidak terdaftar sebagai pemilih pada pemilihan ini.'
      end;
  end if;

  if exists (
    select 1 from public.pemilihan_partisipasi pt
    where pt.pemilihan_id = p_pemilihan_id and pt.jemaat_id = p_jemaat_id
  ) then
    raise exception using errcode = 'PM003', message = c_sudah;
  end if;

  if p_nomor_formulir is not null and exists (
    select 1 from public.pemilihan_partisipasi pt
    where pt.pemilihan_id = p_pemilihan_id and lower(pt.nomor_formulir) = lower(p_nomor_formulir)
  ) then
    raise exception using
      errcode = 'PM007', message = format('Nomor formulir "%s" sudah dipakai pada pemilihan ini.', p_nomor_formulir);
  end if;

  for v_kontes in
    select k.kode, k.nama, k.min_pilih, k.max_pilih from public.pemilihan_kontes k order by k.urutan
  loop
    v_pilihan := coalesce(case v_kontes.kode when 'penatua' then p_penatua when 'ppj' then p_ppj end, '{}'::uuid[]);
    if coalesce(array_ndims(v_pilihan), 1) <> 1 then
      raise exception using
        errcode = 'PM005', message = format('Ada pilihan %s yang bukan calon pada pemilihan ini.', v_kontes.nama);
    end if;
    if exists (
      select 1 from unnest(v_pilihan) as x (id)
      where x.id is not null
      group by x.id
      having count(*) > 1
    ) then
      raise exception using
        errcode = 'PM006', message = format('Ada calon %s yang dipilih lebih dari sekali.', v_kontes.nama);
    end if;
    if exists (
      select 1 from unnest(v_pilihan) as x (id)
      where x.id is null
        or not exists (
          select 1 from public.pemilihan_peserta pp
          where pp.pemilihan_id = p_pemilihan_id and pp.jemaat_id = x.id and pp.dapat_dipilih
        )
    ) then
      raise exception using
        errcode = 'PM005', message = format('Ada pilihan %s yang bukan calon pada pemilihan ini.', v_kontes.nama);
    end if;

    v_jumlah := cardinality(v_pilihan);
    if v_jumlah < v_kontes.min_pilih then
      raise exception using
        errcode = 'PM004',
        message = format('Pilih minimal %s calon %s. Saat ini %s dipilih.', v_kontes.min_pilih, v_kontes.nama, v_jumlah);
    end if;
    if v_jumlah > v_kontes.max_pilih then
      raise exception using
        errcode = 'PM004',
        message = format('Pilih paling banyak %s calon %s. Saat ini %s dipilih.', v_kontes.max_pilih, v_kontes.nama, v_jumlah);
    end if;
  end loop;

  begin
    insert into public.pemilihan_partisipasi (pemilihan_id, jemaat_id, waktu, metode, dibantu_oleh, nomor_formulir)
    values (p_pemilihan_id, p_jemaat_id, v_waktu, p_metode, p_dibantu_oleh, p_nomor_formulir);
  exception when unique_violation then
    -- A second vote (or form number) submitted at the same moment.
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'pemilihan_partisipasi_nomor_formulir_key' then
      raise exception using
        errcode = 'PM007', message = format('Nomor formulir "%s" sudah dipakai pada pemilihan ini.', p_nomor_formulir);
    end if;
    raise exception using errcode = 'PM003', message = c_sudah;
  end;

  -- Shuffled, so even the order inside one ballot says nothing.
  insert into public.pemilihan_suara (pemilihan_id, kontes, kandidat_jemaat_id)
  select p_pemilihan_id, c.kontes, c.kandidat
  from (
    select 'penatua'::text as kontes, x.id as kandidat from unnest(p_penatua) as x (id)
    union all
    select 'ppj'::text, x.id from unnest(p_ppj) as x (id)
  ) as c
  order by random();

  return v_waktu;
end;
$$;

revoke all on function private.pemilihan_catat_suara(uuid, uuid, text, uuid, text, uuid[], uuid[]) from public;

-- Portal: the caller votes (metode mandiri). Returns the time recorded (for
-- the receipt) and the election's name (for the activity log).
create or replace function portal.berikan_suara(pemilihan_id uuid, penatua uuid[], ppj uuid[])
returns table (waktu timestamptz, pemilihan_nama text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_jemaat uuid := portal._jemaat_id_saya();
  v_waktu timestamptz;
begin
  v_waktu := private.pemilihan_catat_suara(
    berikan_suara.pemilihan_id, v_jemaat, 'mandiri', null, null, berikan_suara.penatua, berikan_suara.ppj
  );
  return query
    select v_waktu, pm.nama from public.pemilihan pm where pm.id = berikan_suara.pemilihan_id;
end;
$$;

-- Panitia: records a paper ballot for a voter (metode dibantu, §18.5).
-- Needs pemilihan_bantu:create; a panitia can't do this for their own
-- jemaat record (they vote in the portal). The form number is trimmed,
-- required, at most 50 characters, and unique per election
-- (case-insensitive). Returns the time and the voter's display name for the
-- activity log; never anything about the choices.
create or replace function public.berikan_suara_dibantu(
  p_pemilihan_id uuid,
  p_jemaat_id uuid,
  p_nomor_formulir text,
  p_penatua uuid[],
  p_ppj uuid[]
)
returns table (waktu timestamptz, nama_pemilih text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_nomor text := regexp_replace(coalesce(p_nomor_formulir, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
  v_waktu timestamptz;
begin
  if not public.has_permission(auth.uid(), 'pemilihan_bantu', 'create') then
    raise exception using errcode = '42501', message = 'Kamu tidak punya akses untuk tindakan ini.';
  end if;
  if p_jemaat_id is not null and exists (
    select 1 from public.profiles pr where pr.id = auth.uid() and pr.jemaat_id = p_jemaat_id
  ) then
    raise exception using
      errcode = 'PM008',
      message = 'Panitia tidak bisa membantu memberikan suara untuk dirinya sendiri. Silakan memilih lewat Portal Jemaat.';
  end if;
  if v_nomor = '' then
    raise exception using errcode = 'PM009', message = 'Nomor formulir wajib diisi.';
  end if;
  if char_length(v_nomor) > 50 then
    raise exception using errcode = 'PM009', message = 'Nomor formulir maksimal 50 karakter.';
  end if;

  v_waktu := private.pemilihan_catat_suara(
    p_pemilihan_id, p_jemaat_id, 'dibantu', auth.uid(), v_nomor, p_penatua, p_ppj
  );
  return query
    select v_waktu, pp.nama_tampilan
    from public.pemilihan_peserta pp
    where pp.pemilihan_id = p_pemilihan_id and pp.jemaat_id = p_jemaat_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Portal: the caller's elections and the ballot's candidates
-- ---------------------------------------------------------------------------

-- Every election past draft whose peserta list includes the caller, newest
-- first: whether they may vote, whether (when, how) they voted, and whether
-- the portal may show its results. Never what they chose.
create or replace function portal.pemilihan_aktif_saya()
returns table (
  id uuid,
  nama text,
  periode text,
  status text,
  dibuka_pada timestamptz,
  ditutup_pada timestamptz,
  dapat_memilih boolean,
  sudah_memilih boolean,
  waktu_memilih timestamptz,
  metode text,
  hasil_tersedia boolean
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
      pm.id,
      pm.nama,
      pm.periode,
      pm.status,
      pm.dibuka_pada,
      pm.ditutup_pada,
      pp.dapat_memilih,
      pt.jemaat_id is not null,
      pt.waktu,
      pt.metode,
      private.pemilihan_hasil_publik(pm.status, pm.tampilkan_hasil_saat_berjalan)
    from public.pemilihan_peserta pp
    join public.pemilihan pm on pm.id = pp.pemilihan_id
    left join public.pemilihan_partisipasi pt on pt.pemilihan_id = pp.pemilihan_id and pt.jemaat_id = pp.jemaat_id
    where pp.jemaat_id = v_jemaat
      and pm.status in ('dibuka', 'ditutup', 'diumumkan')
    order by pm.dibuka_pada desc nulls last, pm.created_at desc, pm.id;
end;
$$;

-- The ballot's candidates (both contests share them), by name without the
-- honorific. Only for a voter of this election, and only while it is
-- dibuka.
create or replace function portal.kandidat(pemilihan_id uuid)
returns table (jemaat_id uuid, nama_tampilan text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_jemaat uuid := portal._jemaat_id_saya();
  v_status text;
begin
  select pm.status into v_status from public.pemilihan pm where pm.id = kandidat.pemilihan_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Pemilihan tidak ditemukan.';
  end if;
  if v_status = 'draft' then
    raise exception using errcode = 'PM001', message = 'Pemungutan suara belum dibuka.';
  end if;
  if v_status <> 'dibuka' then
    raise exception using errcode = 'PM001', message = 'Pemungutan suara sudah ditutup.';
  end if;
  if not coalesce((
    select pp.dapat_memilih from public.pemilihan_peserta pp
    where pp.pemilihan_id = kandidat.pemilihan_id and pp.jemaat_id = v_jemaat
  ), false) then
    raise exception using errcode = 'PM002', message = 'Anda tidak terdaftar sebagai pemilih pada pemilihan ini.';
  end if;

  return query
    select pp.jemaat_id, pp.nama_tampilan
    from public.pemilihan_peserta pp
    where pp.pemilihan_id = kandidat.pemilihan_id and pp.dapat_dipilih
    order by private.pemilihan_kunci_nama(pp.nama_tampilan), pp.nama_tampilan, pp.jemaat_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Results
-- ---------------------------------------------------------------------------

-- The tally of one election: every candidate in every contest (0 included),
-- most votes first. peringkat is rank(): candidates with equal votes share
-- it (the UI marks them "Seri").
create or replace function private.pemilihan_rekap(p_pemilihan_id uuid)
returns table (
  kontes text,
  kontes_nama text,
  jemaat_id uuid,
  nama_tampilan text,
  jumlah_suara int,
  peringkat int
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.kode, r.nama, r.jemaat_id, r.nama_tampilan, r.jumlah, r.peringkat
  from (
    select
      k.kode,
      k.nama,
      k.urutan,
      pp.jemaat_id,
      pp.nama_tampilan,
      coalesce(s.jumlah, 0)::int as jumlah,
      (rank() over (partition by k.kode order by coalesce(s.jumlah, 0) desc))::int as peringkat
    from public.pemilihan_kontes k
    cross join public.pemilihan_peserta pp
    left join (
      select su.kontes, su.kandidat_jemaat_id, count(*) as jumlah
      from public.pemilihan_suara su
      where su.pemilihan_id = p_pemilihan_id
      group by su.kontes, su.kandidat_jemaat_id
    ) as s on s.kontes = k.kode and s.kandidat_jemaat_id = pp.jemaat_id
    where pp.pemilihan_id = p_pemilihan_id and pp.dapat_dipilih
  ) as r
  order by r.urutan, r.peringkat, private.pemilihan_kunci_nama(r.nama_tampilan), r.nama_tampilan, r.jemaat_id;
$$;

revoke all on function private.pemilihan_rekap(uuid) from public;

-- Turnout (pemilihan:read), in any status: voters (every peserta with
-- dapat_memilih, with or without a portal account), how many voted and the
-- percentage (one decimal), mandiri vs dibantu, and the assisted votes per
-- panitia as [{user_id, nama, jumlah}] (nama null once the account is gone).
create or replace function public.hasil_partisipasi(p_pemilihan_id uuid)
returns table (
  total_pemilih int,
  sudah_memilih int,
  persen numeric,
  mandiri int,
  dibantu int,
  dibantu_per_panitia jsonb
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
  if not exists (select 1 from public.pemilihan pm where pm.id = p_pemilihan_id) then
    raise exception using errcode = 'P0002', message = 'Pemilihan tidak ditemukan.';
  end if;

  return query
    with
      pemilih as (
        select count(*)::int as n
        from public.pemilihan_peserta pp
        where pp.pemilihan_id = p_pemilihan_id and pp.dapat_memilih
      ),
      pt as (
        select x.metode, x.dibantu_oleh
        from public.pemilihan_partisipasi x
        where x.pemilihan_id = p_pemilihan_id
      ),
      panitia as (
        select pt.dibantu_oleh as user_id, coalesce(nullif(btrim(pr.full_name), ''), pr.email) as nama, count(*)::int as jumlah
        from pt
        left join public.profiles pr on pr.id = pt.dibantu_oleh
        where pt.metode = 'dibantu'
        group by pt.dibantu_oleh, pr.full_name, pr.email
      )
    select
      pemilih.n,
      (select count(*)::int from pt),
      case when pemilih.n = 0 then 0::numeric
        else round(100.0 * (select count(*) from pt) / pemilih.n, 1) end,
      (select count(*)::int from pt where pt.metode = 'mandiri'),
      (select count(*)::int from pt where pt.metode = 'dibantu'),
      coalesce(
        (select jsonb_agg(
           jsonb_build_object('user_id', p.user_id, 'nama', p.nama, 'jumlah', p.jumlah)
           order by p.jumlah desc, p.nama nulls last, p.user_id
         ) from panitia p),
        '[]'::jsonb
      )
    from pemilih;
end;
$$;

-- The full tally for the panitia (pemilihan_hasil:read), in real time and in
-- any status, whatever tampilkan_hasil_saat_berjalan says (that switch is
-- for the Portal Jemaat only). See docs/pemilihan-kerahasiaan.md for why
-- this permission should stay with few people.
create or replace function public.hasil_suara(p_pemilihan_id uuid)
returns table (
  kontes text,
  kontes_nama text,
  jemaat_id uuid,
  nama_tampilan text,
  jumlah_suara int,
  peringkat int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_permission(auth.uid(), 'pemilihan_hasil', 'read') then
    raise exception using errcode = '42501', message = 'Kamu tidak punya akses untuk tindakan ini.';
  end if;
  if not exists (select 1 from public.pemilihan pm where pm.id = p_pemilihan_id) then
    raise exception using errcode = 'P0002', message = 'Pemilihan tidak ditemukan.';
  end if;
  return query select * from private.pemilihan_rekap(p_pemilihan_id);
end;
$$;

-- Portal: the ranked tally, only when the portal may show it (announced, or
-- dibuka / ditutup with tampilkan_hasil_saat_berjalan on); otherwise no rows.
-- Any jemaat account may read it, not only the election's peserta.
create or replace function portal.hasil_pemilihan(id uuid)
returns table (
  kontes text,
  kontes_nama text,
  nama_tampilan text,
  jumlah_suara int,
  peringkat int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_jemaat uuid := portal._jemaat_id_saya();
  v_status text;
  v_tampilkan boolean;
begin
  select pm.status, pm.tampilkan_hasil_saat_berjalan into v_status, v_tampilkan
  from public.pemilihan pm
  where pm.id = hasil_pemilihan.id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Pemilihan tidak ditemukan.';
  end if;
  if not private.pemilihan_hasil_publik(v_status, v_tampilkan) then
    return;
  end if;

  return query
    select r.kontes, r.kontes_nama, r.nama_tampilan, r.jumlah_suara, r.peringkat
    from private.pemilihan_rekap(hasil_pemilihan.id) as r;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: authenticated only; anon, PUBLIC, and service_role get nothing.
-- ---------------------------------------------------------------------------

revoke all on function portal.pemilihan_aktif_saya() from public, anon, service_role;
revoke all on function portal.kandidat(uuid) from public, anon, service_role;
revoke all on function portal.berikan_suara(uuid, uuid[], uuid[]) from public, anon, service_role;
revoke all on function portal.hasil_pemilihan(uuid) from public, anon, service_role;
revoke all on function public.berikan_suara_dibantu(uuid, uuid, text, uuid[], uuid[]) from public, anon, service_role;
revoke all on function public.hasil_partisipasi(uuid) from public, anon, service_role;
revoke all on function public.hasil_suara(uuid) from public, anon, service_role;

grant execute on function portal.pemilihan_aktif_saya() to authenticated;
grant execute on function portal.kandidat(uuid) to authenticated;
grant execute on function portal.berikan_suara(uuid, uuid[], uuid[]) to authenticated;
grant execute on function portal.hasil_pemilihan(uuid) to authenticated;
grant execute on function public.berikan_suara_dibantu(uuid, uuid, text, uuid[], uuid[]) to authenticated;
grant execute on function public.hasil_partisipasi(uuid) to authenticated;
grant execute on function public.hasil_suara(uuid) to authenticated;
