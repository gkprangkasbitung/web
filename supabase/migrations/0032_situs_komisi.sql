-- Stage 11d: Komisi (brief §14.8).
--
-- Permission mapping for this module (explicit instruction for this stage,
-- a deliberate departure from 11b/11c's "every write needs situs:update"
-- convention): komisi and jabatan_komisi use the full situs:{create,read,
-- update,delete} CRUD mapping. Managing members (komisi_anggota) needs
-- situs:update AND warta:read together, because members are jemaat rows,
-- and every church-content table (including jemaat) is guarded by warta
-- (brief §4). No new permission rows: situs/situs_rekening (0029) and warta
-- (0001-0017) already cover it.
--
-- 1. jabatan_komisi: master list of positions (+ seed).
-- 2. komisi_settings: holds the id of the "Penatua" label a pembina must
--    carry. Kept as data (one row), not matched by name in trigger code.
-- 3. komisi: nama/slug/deskripsi/periode/foto/pembina/tampil/sort_order,
--    with an immutable slug and a pembina-label check, both triggers.
-- 4. reorder_komisi(): same atomic contract as reorder_pelayanan/majelis (0030).
-- 5. komisi_anggota: jemaat <-> komisi, with jabatan, a status-eligibility
--    trigger, and a partial-unique "one tunggal jabatan per komisi" index
--    kept in sync with jabatan_komisi.tunggal.
-- 6. add_komisi_anggota() / update_komisi_anggota_jabatan(): friendly
--    pre-checked RPCs for the two main member-management actions, with the
--    hard invariants still enforced by the triggers/indexes above as a backstop.
-- 7. RLS for all three tables; anon has no table access to any of them.
-- 8. public_komisi_list() / public_komisi_detail(): the only things anon can
--    read, limited to tampil = true rows and eligible members (name + jabatan only).
-- 9. situs_referenced_photo_paths() (0029/0030/0031) extended with komisi.

-- ---------------------------------------------------------------------------
-- 1. jabatan_komisi
-- ---------------------------------------------------------------------------

create table public.jabatan_komisi (
  id uuid primary key default gen_random_uuid(),
  nama text not null constraint jabatan_komisi_nama_check check (btrim(nama) <> '' and char_length(nama) <= 100),
  tunggal boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.jabatan_komisi is
  'Master list of komisi positions (brief §14.8). tunggal: at most one holder per komisi (enforced on komisi_anggota).';

create unique index jabatan_komisi_nama_lower_idx on public.jabatan_komisi (lower(nama));

insert into public.jabatan_komisi (nama, tunggal, sort_order) values
  ('Ketua', true, 0),
  ('Wakil Ketua', true, 1),
  ('Sekretaris', true, 2),
  ('Bendahara', true, 3),
  ('Anggota', false, 4);

alter table public.jabatan_komisi enable row level security;
revoke all on public.jabatan_komisi from anon;

create policy jabatan_komisi_select on public.jabatan_komisi
  for select to authenticated
  using (public.has_permission(auth.uid(), 'situs', 'read'));
create policy jabatan_komisi_insert on public.jabatan_komisi
  for insert to authenticated
  with check (public.has_permission(auth.uid(), 'situs', 'create'));
create policy jabatan_komisi_update on public.jabatan_komisi
  for update to authenticated
  using (public.has_permission(auth.uid(), 'situs', 'update'))
  with check (public.has_permission(auth.uid(), 'situs', 'update'));
create policy jabatan_komisi_delete on public.jabatan_komisi
  for delete to authenticated
  using (public.has_permission(auth.uid(), 'situs', 'delete'));

-- ---------------------------------------------------------------------------
-- 2. komisi_settings: the Penatua label id, as data (not a name match in code).
-- ---------------------------------------------------------------------------

create table public.komisi_settings (
  id smallint primary key default 1,
  pembina_label_id uuid references public.label_jemaat (id) on delete set null,
  constraint komisi_settings_singleton check (id = 1)
);

comment on table public.komisi_settings is
  'One row. pembina_label_id names the label a komisi pembina must carry (brief §14.8); not editable through the app this stage.';

-- Ensure a "Penatua" label exists (create it if this database has never had
-- one; label_jemaat has no seeded "Penatua" row), then point the setting at
-- it. Written generically, not seed-specific, same reasoning as 0031's
-- Sambutan-pastor move: this only ever matters once, on a fresh database.
do $$
declare
  v_label_id uuid;
begin
  select id into v_label_id from public.label_jemaat where lower(nama) = 'penatua' limit 1;
  if v_label_id is null then
    insert into public.label_jemaat (nama, sort_order)
    values ('Penatua', coalesce((select max(sort_order) + 1 from public.label_jemaat), 0))
    returning id into v_label_id;
  end if;
  insert into public.komisi_settings (id, pembina_label_id) values (1, v_label_id)
  on conflict (id) do nothing;
end;
$$;

alter table public.komisi_settings enable row level security;
revoke all on public.komisi_settings from anon;
revoke insert, delete, truncate on public.komisi_settings from authenticated;

create policy komisi_settings_select on public.komisi_settings
  for select to authenticated
  using (public.has_permission(auth.uid(), 'situs', 'read'));

-- ---------------------------------------------------------------------------
-- 3. komisi
-- ---------------------------------------------------------------------------

create table public.komisi (
  id uuid primary key default gen_random_uuid(),
  nama text not null constraint komisi_nama_check check (btrim(nama) <> '' and char_length(nama) <= 150),
  -- Default naming (komisi_slug_key) is relied on in the app's insert retry
  -- loop (lib/komisi-routes.ts) to tell a slug collision apart from a nama one.
  slug text not null unique constraint komisi_slug_format_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  deskripsi text constraint komisi_deskripsi_check check (deskripsi is null or (btrim(deskripsi) <> '' and char_length(deskripsi) <= 2000)),
  periode text constraint komisi_periode_check check (periode is null or (btrim(periode) <> '' and char_length(periode) <= 50)),
  foto_path text,
  foto_alt text,
  pembina_jemaat_id uuid references public.jemaat (id) on delete set null,
  tampil boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),

  constraint komisi_foto_check check (
    (foto_path is null) = (foto_alt is null)
    and private.is_situs_photo_path(foto_path)
    and btrim(foto_alt) <> '' and char_length(foto_alt) <= 300
  )
);

comment on table public.komisi is 'Komisi (brief §14.8): table-pattern list with a reorderable "tampil" order and an immutable slug.';

create unique index komisi_nama_lower_idx on public.komisi (lower(nama));

create trigger enforce_situs_photo_paths
  before insert or update on public.komisi
  for each row execute function private.enforce_situs_photo_paths('foto_path');

-- Slug never changes after creation (brief §14.8), whatever writes it: the
-- app (lib/komisi-routes.ts), a future RPC, or a direct REST PATCH.
create or replace function private.enforce_komisi_slug_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.slug is distinct from old.slug then
    raise exception using errcode = '22023', message = 'Slug komisi tidak bisa diubah.';
  end if;
  return new;
end;
$$;

create trigger enforce_komisi_slug_immutable
  before update on public.komisi
  for each row execute function private.enforce_komisi_slug_immutable();

-- The pembina must carry the label named in komisi_settings (brief §14.8).
-- security definer: this is a data-integrity invariant, not a permission
-- check, so it must hold regardless of whether the acting role can itself
-- see jemaat_labels/komisi_settings rows (RLS needs warta:read/situs:read).
create or replace function private.enforce_komisi_pembina_label()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.pembina_jemaat_id is not null and not exists (
    select 1
    from public.jemaat_labels jl
    where jl.jemaat_id = new.pembina_jemaat_id
      and jl.label_id = (select s.pembina_label_id from public.komisi_settings s where s.id = 1)
  ) then
    raise exception using errcode = '22023', message = 'Pembina harus berlabel Penatua.';
  end if;
  return new;
end;
$$;

create trigger enforce_komisi_pembina_label
  before insert or update of pembina_jemaat_id on public.komisi
  for each row execute function private.enforce_komisi_pembina_label();

-- Same contract as reorder_pelayanan/reorder_majelis (0030): `p_ids` must be
-- exactly the current set of rows, or nothing changes.
create or replace function public.reorder_komisi(p_ids uuid[])
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
    or (select count(*) from public.komisi) <> cardinality(v_ids)
    or exists (
      select 1 from unnest(v_ids) as x (id)
      where not exists (select 1 from public.komisi k where k.id = x.id)
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Daftar komisi sudah berubah. Muat ulang halaman lalu coba lagi.';
  end if;

  update public.komisi k
  set sort_order = o.ord - 1
  from unnest(v_ids) with ordinality as o (id, ord)
  where k.id = o.id
    and k.sort_order is distinct from o.ord - 1;
end;
$$;

revoke all on function public.reorder_komisi(uuid[]) from public, anon;
grant execute on function public.reorder_komisi(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. komisi_anggota
-- ---------------------------------------------------------------------------

create table public.komisi_anggota (
  id uuid primary key default gen_random_uuid(),
  komisi_id uuid not null references public.komisi (id) on delete cascade,
  jemaat_id uuid not null references public.jemaat (id) on delete cascade,
  jabatan_id uuid not null references public.jabatan_komisi (id) on delete restrict,
  -- Denormalized copy of jabatan_komisi.tunggal, kept in sync by the triggers
  -- below, so the partial unique index doesn't need a cross-table subquery
  -- (not allowed in an index predicate, and wouldn't stay current anyway).
  jabatan_tunggal boolean not null default false,
  created_at timestamptz not null default now(),

  constraint komisi_anggota_unique unique (komisi_id, jemaat_id)
);

comment on table public.komisi_anggota is
  'Komisi membership (brief §14.8): one row per jemaat per komisi, with a jabatan.';

-- At most one holder of a tunggal jabatan per komisi.
create unique index komisi_anggota_satu_tunggal_idx
  on public.komisi_anggota (komisi_id, jabatan_id)
  where jabatan_tunggal;

create or replace function private.sync_komisi_anggota_jabatan_tunggal()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.jabatan_tunggal := coalesce((select j.tunggal from public.jabatan_komisi j where j.id = new.jabatan_id), false);
  return new;
end;
$$;

create trigger sync_jabatan_tunggal
  before insert or update of jabatan_id on public.komisi_anggota
  for each row execute function private.sync_komisi_anggota_jabatan_tunggal();

-- If an existing jabatan is toggled tunggal (true <-> false) from
-- /admin/komisi/jabatan, every row using it is kept in sync, so the partial
-- index above enforces correctly from that point on. Flipping a jabatan to
-- tunggal while a komisi already holds it more than once raises 23505 here,
-- aborting the jabatan update (mapped to a friendly message in the route).
create or replace function private.cascade_jabatan_tunggal_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tunggal is distinct from old.tunggal then
    update public.komisi_anggota set jabatan_tunggal = new.tunggal where jabatan_id = new.id;
  end if;
  return new;
end;
$$;

create trigger cascade_jabatan_tunggal_change
  after update of tunggal on public.jabatan_komisi
  for each row execute function private.cascade_jabatan_tunggal_change();

-- A member's jemaat must be Sidi or Anggota Penuh (brief §14.8). Checked at
-- write time only: if a member's status later changes to something
-- ineligible, the row is kept (flagged in the admin, hidden from the public
-- site at read time) rather than retroactively rejected or deleted.
-- security definer for the same reason as enforce_komisi_pembina_label above.
create or replace function private.enforce_komisi_anggota_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.jemaat j
    where j.id = new.jemaat_id and j.status_keanggotaan in ('sidi', 'anggota_penuh')
  ) then
    raise exception using errcode = '22023', message = 'Anggota komisi harus berstatus Sidi atau Anggota Penuh.';
  end if;
  return new;
end;
$$;

create trigger enforce_komisi_anggota_status
  before insert or update of jemaat_id on public.komisi_anggota
  for each row execute function private.enforce_komisi_anggota_status();

-- ---------------------------------------------------------------------------
-- 6. Friendly member-management RPCs
-- ---------------------------------------------------------------------------

-- "Tambah Anggota": pre-checks every failure mode with a specific Indonesian
-- message before it can surface as a raw constraint violation. security
-- invoker: RLS (komisi_anggota's policies, below) still applies as a backstop.
create or replace function public.add_komisi_anggota(p_komisi_id uuid, p_jemaat_id uuid, p_jabatan_id uuid)
returns public.komisi_anggota
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_jabatan public.jabatan_komisi;
  v_existing_nama text;
  v_jemaat_nama text;
  v_row public.komisi_anggota;
begin
  if not (public.has_permission(auth.uid(), 'situs', 'update') and public.has_permission(auth.uid(), 'warta', 'read')) then
    raise exception using errcode = '42501', message = 'Kamu tidak punya akses untuk tindakan ini.';
  end if;

  if not exists (select 1 from public.komisi where id = p_komisi_id) then
    raise exception using errcode = 'P0002', message = 'Komisi tidak ditemukan.';
  end if;

  select * into v_jabatan from public.jabatan_komisi where id = p_jabatan_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Jabatan tidak ditemukan.';
  end if;

  select nama into v_jemaat_nama from public.jemaat where id = p_jemaat_id;
  if v_jemaat_nama is null then
    raise exception using errcode = 'P0002', message = 'Jemaat tidak ditemukan.';
  end if;

  if exists (select 1 from public.komisi_anggota where komisi_id = p_komisi_id and jemaat_id = p_jemaat_id) then
    raise exception using errcode = '23505', message = format('%s sudah menjadi anggota komisi ini.', v_jemaat_nama);
  end if;

  if v_jabatan.tunggal then
    select j.nama into v_existing_nama
    from public.komisi_anggota ka
    join public.jemaat j on j.id = ka.jemaat_id
    where ka.komisi_id = p_komisi_id and ka.jabatan_id = p_jabatan_id;
    if v_existing_nama is not null then
      raise exception using errcode = '23505', message = format('Komisi ini sudah punya %s: %s.', v_jabatan.nama, v_existing_nama);
    end if;
  end if;

  insert into public.komisi_anggota (komisi_id, jemaat_id, jabatan_id)
  values (p_komisi_id, p_jemaat_id, p_jabatan_id)
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.add_komisi_anggota(uuid, uuid, uuid) from public, anon;
grant execute on function public.add_komisi_anggota(uuid, uuid, uuid) to authenticated;

-- The inline jabatan editor.
create or replace function public.update_komisi_anggota_jabatan(p_komisi_id uuid, p_jemaat_id uuid, p_jabatan_id uuid)
returns public.komisi_anggota
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_jabatan public.jabatan_komisi;
  v_existing_nama text;
  v_row public.komisi_anggota;
begin
  if not (public.has_permission(auth.uid(), 'situs', 'update') and public.has_permission(auth.uid(), 'warta', 'read')) then
    raise exception using errcode = '42501', message = 'Kamu tidak punya akses untuk tindakan ini.';
  end if;

  if not exists (select 1 from public.komisi_anggota where komisi_id = p_komisi_id and jemaat_id = p_jemaat_id) then
    raise exception using errcode = 'P0002', message = 'Anggota komisi tidak ditemukan.';
  end if;

  select * into v_jabatan from public.jabatan_komisi where id = p_jabatan_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Jabatan tidak ditemukan.';
  end if;

  if v_jabatan.tunggal then
    select j.nama into v_existing_nama
    from public.komisi_anggota ka
    join public.jemaat j on j.id = ka.jemaat_id
    where ka.komisi_id = p_komisi_id and ka.jabatan_id = p_jabatan_id and ka.jemaat_id <> p_jemaat_id;
    if v_existing_nama is not null then
      raise exception using errcode = '23505', message = format('Komisi ini sudah punya %s: %s.', v_jabatan.nama, v_existing_nama);
    end if;
  end if;

  update public.komisi_anggota
  set jabatan_id = p_jabatan_id
  where komisi_id = p_komisi_id and jemaat_id = p_jemaat_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.update_komisi_anggota_jabatan(uuid, uuid, uuid) from public, anon;
grant execute on function public.update_komisi_anggota_jabatan(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. RLS: komisi and jabatan_komisi were set up with their table in step 1/3
--    above; komisi_anggota needs both situs:update and warta:read to write
--    (brief §14.8), and both situs:read and warta:read to read (its rows
--    name a jemaat and a status). anon has no access to any of the three.
-- ---------------------------------------------------------------------------

alter table public.komisi enable row level security;
revoke all on public.komisi from anon;

create policy komisi_select on public.komisi
  for select to authenticated
  using (public.has_permission(auth.uid(), 'situs', 'read'));
create policy komisi_insert on public.komisi
  for insert to authenticated
  with check (public.has_permission(auth.uid(), 'situs', 'create'));
create policy komisi_update on public.komisi
  for update to authenticated
  using (public.has_permission(auth.uid(), 'situs', 'update'))
  with check (public.has_permission(auth.uid(), 'situs', 'update'));
create policy komisi_delete on public.komisi
  for delete to authenticated
  using (public.has_permission(auth.uid(), 'situs', 'delete'));

alter table public.komisi_anggota enable row level security;
revoke all on public.komisi_anggota from anon;

create policy komisi_anggota_select on public.komisi_anggota
  for select to authenticated
  using (public.has_permission(auth.uid(), 'situs', 'read') and public.has_permission(auth.uid(), 'warta', 'read'));
create policy komisi_anggota_insert on public.komisi_anggota
  for insert to authenticated
  with check (public.has_permission(auth.uid(), 'situs', 'update') and public.has_permission(auth.uid(), 'warta', 'read'));
create policy komisi_anggota_update on public.komisi_anggota
  for update to authenticated
  using (public.has_permission(auth.uid(), 'situs', 'update') and public.has_permission(auth.uid(), 'warta', 'read'))
  with check (public.has_permission(auth.uid(), 'situs', 'update') and public.has_permission(auth.uid(), 'warta', 'read'));
create policy komisi_anggota_delete on public.komisi_anggota
  for delete to authenticated
  using (public.has_permission(auth.uid(), 'situs', 'update') and public.has_permission(auth.uid(), 'warta', 'read'));

-- ---------------------------------------------------------------------------
-- 8. Public read
-- ---------------------------------------------------------------------------

create or replace function public.public_komisi_list()
returns table (id uuid, nama text, slug text, deskripsi text, foto_path text, foto_alt text)
language sql
stable
security definer
set search_path = ''
as $$
  select k.id, k.nama, k.slug, k.deskripsi, k.foto_path, k.foto_alt
  from public.komisi k
  where k.tampil = true
  order by k.sort_order, k.created_at, k.id;
$$;

revoke all on function public.public_komisi_list() from public, anon, authenticated, service_role;
grant execute on function public.public_komisi_list() to anon, authenticated;

-- Members: name + jabatan only (brief §14.8). An ineligible member (status
-- changed since joining) is left out here, even though the row still exists
-- for the admin. null when the slug doesn't match a tampil = true row.
create or replace function public.public_komisi_detail(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', k.id,
    'nama', k.nama,
    'slug', k.slug,
    'deskripsi', k.deskripsi,
    'periode', k.periode,
    'foto_path', k.foto_path,
    'foto_alt', k.foto_alt,
    'pembina_nama', pb.nama,
    'anggota', coalesce(
      (
        select jsonb_agg(jsonb_build_object('nama', j.nama, 'jabatan', jb.nama) order by jb.sort_order, j.nama)
        from public.komisi_anggota ka
        join public.jemaat j on j.id = ka.jemaat_id
        join public.jabatan_komisi jb on jb.id = ka.jabatan_id
        where ka.komisi_id = k.id
          and j.status_keanggotaan in ('sidi', 'anggota_penuh')
      ),
      '[]'::jsonb
    )
  )
  from public.komisi k
  left join public.jemaat pb on pb.id = k.pembina_jemaat_id
  where k.slug = p_slug and k.tampil = true;
$$;

revoke all on function public.public_komisi_detail(text) from public, anon, authenticated, service_role;
grant execute on function public.public_komisi_detail(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9. Referenced photo paths (0029/0030/0031's function, extended)
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
    select d.foto_path from public.pendeta d where d.foto_path is not null
    union
    select ko.foto_path from public.komisi ko where ko.foto_path is not null;
end;
$$;
