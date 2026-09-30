-- Stage 10: Pengguna, Roles & Permissions, and Log Aktivitas (brief §9.11-9.13,
-- §12.3).
--
-- 1. super_admin guards. There is always at least one user holding the
--    super_admin role, the role can't be deleted or renamed, and its roles:*
--    and users:* grants can't be removed. Together with 0021 (nobody removes
--    their own roles:* / users:*) this keeps at least one account able to
--    manage Pengguna and Roles & Permissions.
--    Unlike 0021, these guards also apply when auth.uid() is null: deleting a
--    user through the Auth admin API (service role) or the Supabase dashboard
--    cascades into user_roles without a user identity. To repair access by
--    hand, disable the trigger inside a transaction in the SQL Editor (see
--    docs/bootstrap-super-admin.md).
-- 2. set_role_ui_permissions: the permission editor's atomic save, scoped to
--    the resources the UI shows, so the hidden announcements/content grants
--    (brief §12.9) are never touched.
-- 3. Roles: names unique case-insensitively and never blank.
-- 4. activity_logs is append-only for everyone, including the service role,
--    and the email on a row is always the acting user's own.
-- 5. search_activity_logs: the Log Aktivitas text search as a bound parameter.
-- 6. warta.created_by may become null once its user is deleted, so deleting
--    an account that created a warta works (brief §9.11: the warta stays).

-- ---------------------------------------------------------------------------
-- 1. super_admin guards
-- ---------------------------------------------------------------------------

-- user_roles: the last super_admin assignment can't go away, whether by
-- delete (including the cascade from deleting the auth user), by switching
-- it to another role, or by moving it to another user.
create or replace function private.guard_super_admin_remains()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role uuid;
begin
  select id into v_role from public.roles where name = 'super_admin';
  if v_role is null or old.role_id is distinct from v_role then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'UPDATE' and new.role_id = old.role_id and new.user_id = old.user_id then
    return new;
  end if;

  -- Serialize: two super_admins demoting each other at the same time must
  -- not both see the other one still there. Each statement below takes a new
  -- snapshot (READ COMMITTED), so after the lock it sees the other's commit.
  perform 1 from public.roles where id = v_role for update;

  if not exists (
    select 1 from public.user_roles
    where role_id = v_role
      and user_id <> old.user_id
  ) then
    raise exception using errcode = '42501', message = 'Harus ada minimal satu super_admin.';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- roles: super_admin can't be deleted or renamed. Its name is what these
-- guards, the seed, and the bootstrap guide rely on.
create or replace function private.guard_super_admin_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.name = 'super_admin' then
    if tg_op = 'DELETE' then
      raise exception using errcode = '42501', message = 'Role super_admin tidak bisa dihapus.';
    end if;
    if new.name is distinct from old.name then
      raise exception using errcode = '42501', message = 'Nama role super_admin tidak bisa diubah.';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- role_permissions: the super_admin role keeps every roles:* and users:*
-- grant it has.
create or replace function private.guard_super_admin_grants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.role_id = old.role_id and new.permission_id = old.permission_id then
    return new;
  end if;

  if exists (select 1 from public.roles r where r.id = old.role_id and r.name = 'super_admin')
    and exists (
      select 1 from public.permissions p
      where p.id = old.permission_id and p.resource in ('roles', 'users')
    )
  then
    raise exception using
      errcode = '42501',
      message = 'Permission roles dan users milik super_admin tidak bisa dicabut.';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.guard_super_admin_remains() from public;
revoke all on function private.guard_super_admin_role() from public;
revoke all on function private.guard_super_admin_grants() from public;

-- Triggers fire in name order. These names sort after 0021's
-- guard_own_admin_access, so acting on your own access still reports 0021's
-- message; these add the rules 0021 doesn't cover.
create trigger guard_super_admin
  before update or delete on public.user_roles
  for each row execute function private.guard_super_admin_remains();

create trigger guard_super_admin
  before update or delete on public.roles
  for each row execute function private.guard_super_admin_role();

create trigger guard_super_admin
  before update or delete on public.role_permissions
  for each row execute function private.guard_super_admin_grants();

-- ---------------------------------------------------------------------------
-- 2. The permission editor's save (roles:update)
-- ---------------------------------------------------------------------------

-- Replaces a role's permissions within the resources the UI shows (warta,
-- users, roles, activity_log). Grants on any other resource (announcements,
-- content) stay as they are. Ids outside those resources are rejected. The
-- 0021 and super_admin guards apply as on every other path.
create or replace function public.set_role_ui_permissions(p_role_id uuid, p_permission_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_scope constant text[] := array['warta', 'users', 'roles', 'activity_log'];
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

revoke all on function public.set_role_ui_permissions(uuid, uuid[]) from public, anon;
grant execute on function public.set_role_ui_permissions(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Role names
-- ---------------------------------------------------------------------------

-- The existing unique constraint on roles.name is case-sensitive; this also
-- refuses "Editor" next to "editor".
create unique index roles_name_lower_idx on public.roles (lower(name));

alter table public.roles
  add constraint roles_name_not_blank_check check (btrim(name) <> '');

-- ---------------------------------------------------------------------------
-- 4. activity_logs: append-only for everyone
-- ---------------------------------------------------------------------------

-- No role may update, delete, or truncate through its privileges. RLS already
-- had no update/delete policy; this also covers the service role (which
-- bypasses RLS) and TRUNCATE (which RLS never applies to).
revoke update, delete, truncate on public.activity_logs from anon, authenticated, service_role;

-- A signed-in user's row always carries their own email and the current time,
-- whatever the client sent (RLS already forces user_id = auth.uid()). Without
-- a user identity (seed, SQL Editor, tests) the values are kept as given.
create or replace function private.enforce_activity_log_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.user_email := (select u.email from auth.users u where u.id = auth.uid());
    new.created_at := now();
  end if;
  return new;
end;
$$;

-- Rows never change and are never deleted. The one exception is the FK's
-- own `on delete set null` when a user account is deleted: only user_id
-- changes, to null, and every other column stays as it was.
create or replace function private.guard_activity_log_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and old.user_id is not null
    and new.user_id is null
    and (new.id, new.user_email, new.module, new.activity, new.ip_address, new.created_at)
      is not distinct from (old.id, old.user_email, old.module, old.activity, old.ip_address, old.created_at)
  then
    return new;
  end if;
  raise exception using errcode = '42501', message = 'Log aktivitas tidak bisa diubah atau dihapus.';
end;
$$;

revoke all on function private.enforce_activity_log_insert() from public;
revoke all on function private.guard_activity_log_immutable() from public;

create trigger enforce_activity_log_insert
  before insert on public.activity_logs
  for each row execute function private.enforce_activity_log_insert();

create trigger guard_activity_log_immutable
  before update or delete on public.activity_logs
  for each row execute function private.guard_activity_log_immutable();

create trigger guard_activity_log_truncate
  before truncate on public.activity_logs
  for each statement execute function private.guard_activity_log_immutable();

-- ---------------------------------------------------------------------------
-- 5. Log Aktivitas search (activity_log:read)
-- ---------------------------------------------------------------------------

-- Matches the activity sentence or the email case-insensitively. p_search is
-- a bound parameter, never part of a filter string, so commas and
-- parentheses can't add conditions; the caller escapes '%' and '_' (escapeLike)
-- so they match literally. Module, date range, order, and paging are applied
-- by PostgREST on top of the returned rows. SECURITY INVOKER: RLS limits the
-- rows to holders of activity_log:read, like reading the table directly.
create or replace function public.search_activity_logs(p_search text default null)
returns setof public.activity_logs
language sql
stable
security invoker
set search_path = ''
as $$
  select l.*
  from public.activity_logs l
  where coalesce(btrim(p_search), '') = ''
    or l.activity ilike '%' || p_search || '%'
    or l.user_email ilike '%' || p_search || '%'
$$;

revoke all on function public.search_activity_logs(text) from public, anon;
grant execute on function public.search_activity_logs(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. warta.created_by when its user is deleted
-- ---------------------------------------------------------------------------

-- 0026's trigger reverted every change to created_by, including the FK's own
-- `on delete set null` when the author's account is deleted, which left the
-- delete failing or the reference dangling. Same function, one change:
-- created_by may become null, but only once that user no longer exists.
-- Any other rewrite is still reverted silently, as before.
-- SECURITY DEFINER (0026's was invoker) only so it can check auth.users; the
-- function reads nothing else and writes nothing but NEW.
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
    new.renungan_judul, new.renungan_kitab, new.renungan_isi, new.renungan_sumber
  ) is distinct from (
    old.tanggal_kebaktian, old.judul_kebaktian, old.tema_kebaktian,
    old.renungan_judul, old.renungan_kitab, old.renungan_isi, old.renungan_sumber
  ) then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;

  return new;
end;
$$;
