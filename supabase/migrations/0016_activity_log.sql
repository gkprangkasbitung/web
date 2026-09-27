-- Activity log: an append-only audit trail of admin actions (who did what,
-- when, from where). Mutating API routes and server actions insert a row
-- here via src/lib/activity-log.ts right after the action succeeds.

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  user_email text,
  module text not null,
  activity text not null,
  ip_address text,
  created_at timestamptz not null default now()
);

create index activity_logs_created_at_idx on public.activity_logs (created_at desc);

alter table public.activity_logs enable row level security;

-- Append-only: any authenticated user may insert a row attributed to
-- themselves (the app always does this server-side right after a
-- successful action) - there is no update/delete policy, so entries can
-- never be changed or removed once written.
create policy "activity_logs_insert" on public.activity_logs
  for insert
  with check (auth.uid() = user_id);

create policy "activity_logs_select" on public.activity_logs
  for select
  using (public.has_permission(auth.uid(), 'activity_log', 'read'));

insert into public.permissions (resource, action, description) values
  ('activity_log', 'read', 'activity_log:read')
on conflict (resource, action) do nothing;

-- Re-run the super_admin "everything" grant so the new permission is
-- included too (existing pairs are skipped via ON CONFLICT). Deliberately
-- not granted to admin/editor/viewer - same restriction as the roles and
-- users resources, since an audit trail should only be visible to the
-- most trusted role.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.name = 'super_admin'
on conflict do nothing;
