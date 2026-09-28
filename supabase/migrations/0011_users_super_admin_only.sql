-- Restrict Pengguna (account) management to super_admin only. Reassigning
-- roles/jemaat links is privilege-sensitive (an "admin" could otherwise
-- grant themselves or anyone else super_admin), so admin loses the users
-- resource entirely here - same treatment already given to the roles
-- resource, which only super_admin can write.
delete from public.role_permissions
where role_id = (select id from public.roles where name = 'admin')
  and permission_id in (select id from public.permissions where resource = 'users');

update public.roles
set description = 'Manages day-to-day content, cannot manage users or edit roles/permissions'
where name = 'admin';
