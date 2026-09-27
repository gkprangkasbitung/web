-- RBAC schema: profiles, roles, permissions, and the join tables that
-- connect a Supabase auth user to one or more roles, and a role to one or
-- more permissions.
--
-- Run this in the Supabase SQL Editor, or via `supabase db push` if you use
-- the Supabase CLI locally.

create extension if not exists "pgcrypto";

-- One row per auth.users row. Created automatically by the trigger below.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  resource text not null,
  action text not null,
  description text,
  unique (resource, action)
);

create table if not exists public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete cascade,
  primary key (role_id, permission_id)
);

create table if not exists public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete cascade,
  primary key (user_id, role_id)
);

-- ---------------------------------------------------------------------------
-- Auto-create a profile row whenever a new user signs up / is invited.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profiles.email in sync if a user changes their login email.
create or replace function public.handle_user_email_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row execute function public.handle_user_email_update();

-- ---------------------------------------------------------------------------
-- has_permission(): the single function RLS policies (and the app's DAL)
-- rely on to answer "can this user do X on Y". SECURITY DEFINER so it can
-- read role_permissions/user_roles regardless of the caller's own RLS
-- policies on those tables, which avoids policy recursion.
-- ---------------------------------------------------------------------------
create or replace function public.has_permission(
  p_user_id uuid,
  p_resource text,
  p_action text
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions p on p.id = rp.permission_id
    where ur.user_id = p_user_id
      and p.resource = p_resource
      and p.action = p_action
  );
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;

-- profiles: everyone can read their own profile; users:read can read all;
-- users can update their own profile; users:update can update anyone's.
create policy "profiles_select" on public.profiles
  for select using (
    id = auth.uid() or public.has_permission(auth.uid(), 'users', 'read')
  );

create policy "profiles_update" on public.profiles
  for update using (
    id = auth.uid() or public.has_permission(auth.uid(), 'users', 'update')
  );

-- roles / permissions / role_permissions: gated behind the "roles" resource,
-- since viewing or editing them is RBAC administration.
create policy "roles_select" on public.roles
  for select using (public.has_permission(auth.uid(), 'roles', 'read'));

create policy "roles_insert" on public.roles
  for insert with check (public.has_permission(auth.uid(), 'roles', 'create'));

create policy "roles_update" on public.roles
  for update using (public.has_permission(auth.uid(), 'roles', 'update'));

create policy "roles_delete" on public.roles
  for delete using (public.has_permission(auth.uid(), 'roles', 'delete'));

create policy "permissions_select" on public.permissions
  for select using (public.has_permission(auth.uid(), 'roles', 'read'));

create policy "role_permissions_select" on public.role_permissions
  for select using (public.has_permission(auth.uid(), 'roles', 'read'));

create policy "role_permissions_write" on public.role_permissions
  for all using (public.has_permission(auth.uid(), 'roles', 'update'))
  with check (public.has_permission(auth.uid(), 'roles', 'update'));

-- user_roles: a user can see their own role assignments; users:read/update
-- can see and manage everyone's.
create policy "user_roles_select" on public.user_roles
  for select using (
    user_id = auth.uid() or public.has_permission(auth.uid(), 'users', 'read')
  );

create policy "user_roles_write" on public.user_roles
  for all using (public.has_permission(auth.uid(), 'users', 'update'))
  with check (public.has_permission(auth.uid(), 'users', 'update'));
