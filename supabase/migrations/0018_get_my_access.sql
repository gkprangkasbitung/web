-- Lets every signed-in user read their own roles and the permissions those
-- roles grant. roles / permissions / role_permissions are only readable with
-- roles:read (0001), so an editor or viewer could not otherwise load their
-- own role names or permission set. SECURITY DEFINER, but scoped strictly to
-- auth.uid(): it never returns another user's access.
--
-- A role without permissions still appears once, with null resource/action.

create or replace function public.get_my_access()
returns table (role_id uuid, role_name text, resource text, action text)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.name, p.resource, p.action
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  left join public.role_permissions rp on rp.role_id = r.id
  left join public.permissions p on p.id = rp.permission_id
  where ur.user_id = auth.uid();
$$;

revoke all on function public.get_my_access() from public, anon;
grant execute on function public.get_my_access() to authenticated;
