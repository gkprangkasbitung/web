-- Default roles + the full permission matrix, then wires them together.
-- Safe to re-run: everything uses ON CONFLICT DO NOTHING.

insert into public.roles (name, description) values
  ('super_admin', 'Full access to every resource, including RBAC management itself'),
  ('admin', 'Manages users and day-to-day content, cannot edit roles/permissions'),
  ('editor', 'Creates and edits content and announcements'),
  ('viewer', 'Read-only access to the admin dashboard')
on conflict (name) do nothing;

insert into public.permissions (resource, action, description)
select resource, action, resource || ':' || action
from unnest(array['users', 'roles', 'announcements', 'content']) as resource
cross join unnest(array['create', 'read', 'update', 'delete']) as action
on conflict (resource, action) do nothing;

-- super_admin: every permission
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.name = 'super_admin'
on conflict do nothing;

-- admin: manage users, read roles, full control of announcements/content
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on (
  (p.resource = 'users' and p.action in ('read', 'update')) or
  (p.resource = 'roles' and p.action = 'read') or
  (p.resource in ('announcements', 'content'))
)
where r.name = 'admin'
on conflict do nothing;

-- editor: create/read/update announcements and content (no delete)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on (
  p.resource in ('announcements', 'content') and p.action in ('create', 'read', 'update')
)
where r.name = 'editor'
on conflict do nothing;

-- viewer: read-only on announcements and content
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on (
  p.resource in ('announcements', 'content') and p.action = 'read'
)
where r.name = 'viewer'
on conflict do nothing;
