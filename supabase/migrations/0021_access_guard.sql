-- Nobody can remove their own roles:* or users:* access (brief §12.3). In
-- practice only super_admin holds those permissions, and without this guard
-- a super_admin could lock every account out of Pengguna and Roles &
-- Permissions.
--
-- The rule sits in triggers, not only in the RPCs (0022), because holders of
-- users:update / roles:update can also write user_roles and role_permissions
-- directly through the REST API. The triggers cover every path: RPCs, direct
-- writes, deleting a role you hold (the FK cascade fires the child tables'
-- triggers too), and deleting or renaming a permission.
--
-- The acting user is auth.uid(). When it is null (SQL Editor as postgres,
-- the service role, migrations) the guard stands aside, so the first
-- super_admin can still be bootstrapped and access repaired by hand.

-- Raises unless the acting user keeps every roles:* / users:* permission they
-- hold now once the given grants are gone. A grant is removed by role
-- (p_without_role), by a single role_permissions row (p_without_grant_role +
-- p_without_grant_permission), or by permission (p_without_permission).
create or replace function private.assert_keeps_own_admin_access(
  p_without_role uuid default null,
  p_without_grant_role uuid default null,
  p_without_grant_permission uuid default null,
  p_without_permission uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    return;
  end if;

  if exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions p on p.id = rp.permission_id
    where ur.user_id = v_actor
      and p.resource in ('roles', 'users')
      and not exists (
        select 1
        from public.user_roles ur2
        join public.role_permissions rp2 on rp2.role_id = ur2.role_id
        where ur2.user_id = v_actor
          and rp2.permission_id = p.id
          and ur2.role_id is distinct from p_without_role
          and rp2.permission_id is distinct from p_without_permission
          and not (
            rp2.role_id is not distinct from p_without_grant_role
            and rp2.permission_id is not distinct from p_without_grant_permission
          )
      )
  ) then
    raise exception using
      errcode = '42501',
      message = 'Tidak bisa mencabut akses roles atau users milik akun sendiri.';
  end if;
end;
$$;

-- user_roles: removing or changing one of your own role assignments.
create or replace function private.guard_user_roles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new is not distinct from old then
    return new;
  end if;

  if old.user_id = auth.uid() then
    perform private.assert_keeps_own_admin_access(p_without_role => old.role_id);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- role_permissions: taking a permission away from a role you hold.
create or replace function private.guard_role_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new is not distinct from old then
    return new;
  end if;

  perform private.assert_keeps_own_admin_access(
    p_without_grant_role => old.role_id,
    p_without_grant_permission => old.permission_id
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- roles: deleting a role you hold. Checked here, before the cascade, so the
-- outcome does not depend on the order in which the cascade runs.
create or replace function private.guard_roles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_keeps_own_admin_access(p_without_role => old.id);
  return old;
end;
$$;

-- permissions: deleting a permission, or renaming it to another resource or
-- action. No RLS policy lets users write this table today; the guard is here
-- so a future policy or function can't bypass the rule.
create or replace function private.guard_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.resource = old.resource and new.action = old.action then
    return new;
  end if;

  perform private.assert_keeps_own_admin_access(p_without_permission => old.id);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.assert_keeps_own_admin_access(uuid, uuid, uuid, uuid) from public;
revoke all on function private.guard_user_roles() from public;
revoke all on function private.guard_role_permissions() from public;
revoke all on function private.guard_roles() from public;
revoke all on function private.guard_permissions() from public;

create trigger guard_own_admin_access
  before update or delete on public.user_roles
  for each row execute function private.guard_user_roles();

create trigger guard_own_admin_access
  before update or delete on public.role_permissions
  for each row execute function private.guard_role_permissions();

create trigger guard_own_admin_access
  before delete on public.roles
  for each row execute function private.guard_roles();

create trigger guard_own_admin_access
  before update or delete on public.permissions
  for each row execute function private.guard_permissions();
