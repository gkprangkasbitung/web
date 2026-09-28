-- Multi-step writes as single Postgres functions, so each runs in one
-- transaction and either fully succeeds or leaves nothing behind (brief
-- §12.6). Route handlers call them through supabase.rpc() with the user's own
-- session, so auth.uid() is the acting user.
--
-- Every function checks the permission explicitly first, so a caller without
-- it gets a clear error instead of a write that RLS silently filters to
-- nothing. SECURITY INVOKER is the default, so RLS still applies as a second
-- layer. SECURITY DEFINER is used only where a function must write something
-- RLS or column privileges keep from the caller; each such function says why.
--
-- Errors, with Indonesian messages, for route handlers to map:
--   42501 no permission / refused                    -> 403
--   P0002 record not found                           -> 404
--   23505 conflict (jemaat already linked, slug taken) -> 409
--   23503 unknown label or permission id             -> 400
--   22023 invalid input                              -> 400

-- ---------------------------------------------------------------------------
-- Pengguna (users:update)
-- ---------------------------------------------------------------------------

-- Replaces all of a user's roles with p_role_id (null = "Tidak ada"). The UI
-- assigns one role per user. The new role is inserted before the others are
-- removed, and an unchanged assignment is a no-op. Your own roles can't be
-- changed here (brief §12.3); the 0021 triggers enforce the roles:* /
-- users:* rule on every other path.
create or replace function public.set_user_role(p_user_id uuid, p_role_id uuid default null)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.has_permission(auth.uid(), 'users', 'update') then
    raise exception using errcode = '42501', message = 'Kamu tidak punya akses untuk tindakan ini.';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception using errcode = 'P0002', message = 'Pengguna tidak ditemukan.';
  end if;
  if p_role_id is not null and not exists (select 1 from public.roles where id = p_role_id) then
    raise exception using errcode = 'P0002', message = 'Role tidak ditemukan.';
  end if;

  -- Already exactly this role (or no role at all when p_role_id is null).
  if not exists (
    select 1 from public.user_roles
    where user_id = p_user_id and role_id is distinct from p_role_id
  ) and (
    p_role_id is null
    or exists (select 1 from public.user_roles where user_id = p_user_id and role_id = p_role_id)
  ) then
    return;
  end if;

  if p_user_id = auth.uid() then
    raise exception using errcode = '42501', message = 'Tidak bisa mengubah role akun sendiri.';
  end if;

  if p_role_id is not null then
    insert into public.user_roles (user_id, role_id)
    values (p_user_id, p_role_id)
    on conflict do nothing;
  end if;

  delete from public.user_roles
  where user_id = p_user_id
    and role_id is distinct from p_role_id;
end;
$$;

-- Links a user to a jemaat, or unlinks with null. A jemaat can belong to at
-- most one account.
-- SECURITY DEFINER: since 0019, authenticated can no longer update
-- profiles.jemaat_id (a user could otherwise claim any jemaat for their own
-- account), so this function is the only way to change it.
create or replace function public.link_user_jemaat(p_user_id uuid, p_jemaat_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_permission(auth.uid(), 'users', 'update') then
    raise exception using errcode = '42501', message = 'Kamu tidak punya akses untuk tindakan ini.';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception using errcode = 'P0002', message = 'Pengguna tidak ditemukan.';
  end if;

  if p_jemaat_id is not null then
    if not exists (select 1 from public.jemaat where id = p_jemaat_id) then
      raise exception using errcode = 'P0002', message = 'Jemaat tidak ditemukan.';
    end if;
    if exists (select 1 from public.profiles where jemaat_id = p_jemaat_id and id <> p_user_id) then
      raise exception using errcode = '23505', message = 'Jemaat ini sudah terhubung ke akun lain.';
    end if;
  end if;

  update public.profiles
  set jemaat_id = p_jemaat_id
  where id = p_user_id;
end;
$$;

-- Sets a user's role and jemaat link together: both change or neither does.
-- Used right after auth.admin.inviteUserByEmail, which can't be part of this
-- transaction; if this call fails, the route answers 207 because the invite
-- itself already went out.
create or replace function public.set_user_access(
  p_user_id uuid,
  p_role_id uuid default null,
  p_jemaat_id uuid default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.has_permission(auth.uid(), 'users', 'update') then
    raise exception using errcode = '42501', message = 'Kamu tidak punya akses untuk tindakan ini.';
  end if;

  perform public.set_user_role(p_user_id, p_role_id);
  perform public.link_user_jemaat(p_user_id, p_jemaat_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Roles & Permissions (roles:update)
-- ---------------------------------------------------------------------------

-- Replaces a role's permission set (the permission editor, brief §12.3). The
-- 0021 triggers refuse the change if it would take away the caller's own
-- roles:* or users:* access.
create or replace function public.set_role_permissions(p_role_id uuid, p_permission_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_permission_ids uuid[] := coalesce(p_permission_ids, '{}');
begin
  if not public.has_permission(auth.uid(), 'roles', 'update') then
    raise exception using errcode = '42501', message = 'Kamu tidak punya akses untuk tindakan ini.';
  end if;
  if not exists (select 1 from public.roles where id = p_role_id) then
    raise exception using errcode = 'P0002', message = 'Role tidak ditemukan.';
  end if;
  if exists (
    select 1 from unnest(v_permission_ids) as x (id)
    where x.id is null or not exists (select 1 from public.permissions p where p.id = x.id)
  ) then
    raise exception using errcode = '23503', message = 'Permission tidak ditemukan.';
  end if;

  insert into public.role_permissions (role_id, permission_id)
  select distinct p_role_id, x.id
  from unnest(v_permission_ids) as x (id)
  on conflict do nothing;

  delete from public.role_permissions
  where role_id = p_role_id
    and permission_id <> all (v_permission_ids);
end;
$$;

-- ---------------------------------------------------------------------------
-- Content (warta:*)
-- ---------------------------------------------------------------------------

-- Creates a draft warta and its snapshot of the active Litbang cards in one
-- step (brief §9.4). A taken slug raises 23505; the caller retries with a
-- random suffix. Returns the new warta's id.
-- SECURITY DEFINER: the snapshot must copy the whole active template for
-- anyone with warta:create. Under RLS, a caller without warta:read would copy
-- nothing and get no error.
create or replace function public.create_warta(
  p_slug text,
  p_tanggal_kebaktian date,
  p_judul_kebaktian text,
  p_tema_kebaktian text default null,
  p_renungan_judul text default null,
  p_renungan_kitab text default null,
  p_renungan_isi text default null,
  p_renungan_sumber text default null
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
    renungan_judul, renungan_kitab, renungan_isi, renungan_sumber, created_by
  )
  values (
    p_slug, 'draft', p_tanggal_kebaktian, p_judul_kebaktian, p_tema_kebaktian,
    p_renungan_judul, p_renungan_kitab, p_renungan_isi, p_renungan_sumber, auth.uid()
  )
  returning id into v_id;

  insert into public.warta_litbang_items (warta_id, litbang_category_id, name, deskripsi, sort_order)
  select v_id, c.id, c.name, c.deskripsi, c.sort_order
  from public.litbang_categories c
  where c.active;

  return v_id;
end;
$$;

-- Saves the Litbang template order: sort_order = position, starting at 0 like
-- appended rows. p_ids must list every card exactly once; otherwise the list
-- changed since the page loaded and nothing is saved.
create or replace function public.reorder_litbang_categories(p_ids uuid[])
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
    or (select count(*) from public.litbang_categories) <> cardinality(v_ids)
    or exists (
      select 1 from unnest(v_ids) as x (id)
      where not exists (select 1 from public.litbang_categories c where c.id = x.id)
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Daftar Litbang sudah berubah. Muat ulang halaman lalu coba lagi.';
  end if;

  update public.litbang_categories c
  set sort_order = o.ord - 1
  from unnest(v_ids) with ordinality as o (id, ord)
  where c.id = o.id
    and c.sort_order is distinct from o.ord - 1;
end;
$$;

-- Deletes a family but keeps its members: their keluarga_id and
-- hubungan_keluarga are cleared (brief §9.10). The foreign key alone would
-- clear only keluarga_id.
create or replace function public.delete_keluarga(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.has_permission(auth.uid(), 'warta', 'update') then
    raise exception using errcode = '42501', message = 'Kamu tidak punya akses untuk tindakan ini.';
  end if;
  if not exists (select 1 from public.keluarga where id = p_id) then
    raise exception using errcode = 'P0002', message = 'Keluarga tidak ditemukan.';
  end if;

  update public.jemaat
  set keluarga_id = null,
      hubungan_keluarga = null
  where keluarga_id = p_id;

  delete from public.keluarga where id = p_id;
end;
$$;

-- Replaces a jemaat's labels with exactly p_label_ids (brief §9.9).
create or replace function public.replace_jemaat_labels(p_jemaat_id uuid, p_label_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_label_ids uuid[] := coalesce(p_label_ids, '{}');
begin
  if not public.has_permission(auth.uid(), 'warta', 'update') then
    raise exception using errcode = '42501', message = 'Kamu tidak punya akses untuk tindakan ini.';
  end if;
  if not exists (select 1 from public.jemaat where id = p_jemaat_id) then
    raise exception using errcode = 'P0002', message = 'Jemaat tidak ditemukan.';
  end if;
  if exists (
    select 1 from unnest(v_label_ids) as x (id)
    where x.id is null or not exists (select 1 from public.label_jemaat l where l.id = x.id)
  ) then
    raise exception using errcode = '23503', message = 'Label tidak ditemukan.';
  end if;

  delete from public.jemaat_labels
  where jemaat_id = p_jemaat_id
    and label_id <> all (v_label_ids);

  insert into public.jemaat_labels (jemaat_id, label_id)
  select distinct p_jemaat_id, x.id
  from unnest(v_label_ids) as x (id)
  on conflict do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges: signed-in users only. Supabase's default privileges grant
-- EXECUTE to anon directly, so it is revoked by name, not only from PUBLIC.
-- ---------------------------------------------------------------------------
revoke all on function public.set_user_role(uuid, uuid) from public, anon;
revoke all on function public.link_user_jemaat(uuid, uuid) from public, anon;
revoke all on function public.set_user_access(uuid, uuid, uuid) from public, anon;
revoke all on function public.set_role_permissions(uuid, uuid[]) from public, anon;
revoke all on function public.create_warta(text, date, text, text, text, text, text, text) from public, anon;
revoke all on function public.reorder_litbang_categories(uuid[]) from public, anon;
revoke all on function public.delete_keluarga(uuid) from public, anon;
revoke all on function public.replace_jemaat_labels(uuid, uuid[]) from public, anon;

grant execute on function public.set_user_role(uuid, uuid) to authenticated;
grant execute on function public.link_user_jemaat(uuid, uuid) to authenticated;
grant execute on function public.set_user_access(uuid, uuid, uuid) to authenticated;
grant execute on function public.set_role_permissions(uuid, uuid[]) to authenticated;
grant execute on function public.create_warta(text, date, text, text, text, text, text, text) to authenticated;
grant execute on function public.reorder_litbang_categories(uuid[]) to authenticated;
grant execute on function public.delete_keluarga(uuid) to authenticated;
grant execute on function public.replace_jemaat_labels(uuid, uuid[]) to authenticated;
