-- Stage 14d: username accounts for the Portal Jemaat (brief §18.7).
--
-- 1. profiles.username (citext, unique, lowercase a–z0–9 segments joined by
--    dots, 3–30 characters, reserved words refused) and
--    profiles.wajib_ganti_password. Neither is writable by authenticated:
--    0019's column grant (full_name, avatar_url) still applies.
-- 2. A second auth.users insert trigger that turns an account created by the
--    server (service role, app_metadata portal_username + portal_jemaat_id)
--    into a username account in the same transaction: username, jemaat link,
--    the jemaat's name, and wajib_ganti_password. A clash (username, or a
--    jemaat that already has an account) makes the whole createUser fail,
--    so no half-made account is left behind.
-- 3. public.siapkan_reset_password(p_user_id): the permission check and the
--    database half of a password reset (§18.7): users:update, or
--    pemilihan:update, for jemaat-only accounts. Turns the flag on and
--    revokes the account's sessions. The server then sets the new password
--    with the service role.
-- 4. public.selesai_ganti_password_sementara(): clears the caller's own flag
--    after the portal's forced password change.
-- 5. portal._jemaat_id_saya() (0037) also refuses while the flag is on
--    (PT428), so every portal function, berikan_suara included, is blocked
--    over REST as well, not only the pages.
-- 6. private.auth_throttle_limits (0034) gains the login buckets.

create extension if not exists citext with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------

-- Reserved words (§18.7). A username is refused when any dot-separated
-- segment, with trailing digits removed, is one of them: "admin",
-- "admin2", and "gkp.admin" are all refused. Mirrored in
-- src/lib/portal-username.ts (an integration test compares the two lists).
create or replace function private.username_kata_terlarang()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'admin', 'administrator', 'api', 'bendahara', 'gereja', 'gkp', 'jemaat', 'login', 'mail',
    'majelis', 'masuk', 'noreply', 'null', 'panitia', 'pengurus', 'portal', 'postmaster', 'root',
    'sekretariat', 'sistem', 'staff', 'superadmin', 'superuser', 'support', 'system', 'test',
    'undefined', 'webmaster', 'www'
  ]::text[];
$$;

create or replace function private.username_terlarang(p_username text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select exists (
    select 1
    from unnest(string_to_array(lower(p_username), '.')) as s (segmen)
    where regexp_replace(s.segmen, '[0-9]+$', '') = any (private.username_kata_terlarang())
  );
$$;

-- profiles_username_check (below) calls these with the privileges of whoever
-- writes the row, so every role that updates profiles needs them (a plain
-- full_name change in Profil Saya runs the CHECK too). They only return the
-- fixed word list and a yes/no about the given text.
revoke all on function private.username_kata_terlarang() from public;
revoke all on function private.username_terlarang(text) from public;
grant execute on function private.username_kata_terlarang() to authenticated, service_role;
grant execute on function private.username_terlarang(text) to authenticated, service_role;

alter table public.profiles add column username extensions.citext;
alter table public.profiles add column wajib_ganti_password boolean not null default false;

-- Cast to text: citext's ~ ignores case, and only lowercase is stored.
alter table public.profiles
  add constraint profiles_username_key unique (username),
  add constraint profiles_username_check check (
    username is null
    or (
      username::text ~ '^[a-z0-9]+(\.[a-z0-9]+)*$'
      and char_length(username::text) between 3 and 30
      and not private.username_terlarang(username::text)
    )
  );

comment on column public.profiles.username is
  'Portal Jemaat login name (brief §18.7). The auth email is {username}@{PORTAL_LOGIN_DOMAIN}; never shown to jemaat.';
comment on column public.profiles.wajib_ganti_password is
  'A temporary password was issued (new account or reset): the portal forces a change before any other page.';

-- ---------------------------------------------------------------------------
-- 2. Username accounts, created in one transaction with the auth user
-- ---------------------------------------------------------------------------

-- GoTrue's admin createUser inserts the user, then writes app_metadata with
-- an UPDATE in the same transaction, so this fires on that UPDATE (and on an
-- insert that already carries the keys). It acts only when portal_username
-- first appears, and only on a profile without a username: later
-- app_metadata changes do nothing. 0001's on_auth_user_created has already
-- made the profile row. Only the service role can set app_metadata, and
-- public sign-up can't, so these keys come from our own server.
create or replace function private.handle_new_portal_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := new.raw_app_meta_data ->> 'portal_username';
  v_jemaat_id uuid;
  v_nama text;
begin
  if v_username is null
    or (tg_op = 'UPDATE' and old.raw_app_meta_data ->> 'portal_username' is not null)
    or exists (select 1 from public.profiles p where p.id = new.id and p.username is not null)
  then
    return new;
  end if;

  if split_part(lower(new.email), '@', 1) <> v_username then
    raise exception using errcode = '22023', message = 'Email akun tidak sesuai dengan username.';
  end if;

  v_jemaat_id := (new.raw_app_meta_data ->> 'portal_jemaat_id')::uuid;
  select j.nama into v_nama from public.jemaat j where j.id = v_jemaat_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Jemaat tidak ditemukan.';
  end if;
  if exists (select 1 from public.profiles p where p.jemaat_id = v_jemaat_id) then
    raise exception using errcode = '23505', message = 'Jemaat ini sudah terhubung ke akun lain.';
  end if;

  update public.profiles
  set username = v_username,
      jemaat_id = v_jemaat_id,
      full_name = v_nama,
      wajib_ganti_password = true
  where id = new.id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Profil akun tidak ditemukan.';
  end if;

  return new;
end;
$$;

revoke all on function private.handle_new_portal_user() from public;

create trigger on_auth_user_created_portal
  after insert or update of raw_app_meta_data on auth.users
  for each row execute function private.handle_new_portal_user();

-- ---------------------------------------------------------------------------
-- 3. Password reset by admin / panitia
-- ---------------------------------------------------------------------------

-- Who may reset (§18.7, stage 14d): users:update or pemilihan:update, and
-- only for a jemaat-only account (linked to a jemaat, no role). Staff
-- accounts aren't reset this way: the forced change exists only in the
-- portal. The permission is checked before anything about the target, so a
-- refused caller learns nothing about it.
--
-- Turns wajib_ganti_password on and deletes the account's sessions (their
-- refresh tokens cascade), so a device still signed in with the old
-- password is signed out at its next refresh. Returns what the app logs.
create or replace function public.siapkan_reset_password(p_user_id uuid)
returns table (nama text, username text, email text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_profile record;
begin
  if not (
    public.has_permission(auth.uid(), 'users', 'update')
    or public.has_permission(auth.uid(), 'pemilihan', 'update')
  ) then
    raise exception using errcode = '42501', message = 'Kamu tidak punya akses untuk tindakan ini.';
  end if;

  select p.id, p.full_name, p.username, p.email, p.jemaat_id, j.nama as jemaat_nama
  into v_profile
  from public.profiles p
  left join public.jemaat j on j.id = p.jemaat_id
  where p.id = p_user_id
  for update of p;
  if not found then
    raise exception using errcode = 'P0002', message = 'Pengguna tidak ditemukan.';
  end if;

  if p_user_id = auth.uid() then
    raise exception using errcode = '22023', message = 'Password akun sendiri tidak bisa direset dari sini.';
  end if;
  if v_profile.jemaat_id is null then
    raise exception using errcode = '22023', message = 'Hanya akun jemaat yang bisa direset passwordnya.';
  end if;
  if exists (select 1 from public.user_roles ur where ur.user_id = p_user_id) then
    raise exception using
      errcode = '22023',
      message = 'Password akun pengurus tidak bisa direset dari sini.';
  end if;

  update public.profiles set wajib_ganti_password = true where id = p_user_id;
  delete from auth.sessions s where s.user_id = p_user_id;

  return query
    select
      coalesce(v_profile.jemaat_nama, nullif(btrim(v_profile.full_name), ''), v_profile.email::text),
      v_profile.username::text,
      v_profile.email::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Clearing the flag after the forced change
-- ---------------------------------------------------------------------------

-- The caller's own flag only. Called by the portal right after
-- auth.updateUser({ password }) succeeds. Someone calling it without
-- changing their password only keeps the password printed on their slip.
create or replace function public.selesai_ganti_password_sementara()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Kamu tidak punya akses untuk tindakan ini.';
  end if;
  update public.profiles set wajib_ganti_password = false where id = auth.uid();
end;
$$;

revoke all on function public.siapkan_reset_password(uuid) from public, anon, service_role;
revoke all on function public.selesai_ganti_password_sementara() from public, anon, service_role;
grant execute on function public.siapkan_reset_password(uuid) to authenticated;
grant execute on function public.selesai_ganti_password_sementara() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Portal functions refuse while a temporary password is in use
-- ---------------------------------------------------------------------------

-- As in 0037, plus PT428 (PostgREST answers HTTP 428) while
-- wajib_ganti_password is on.
create or replace function portal._jemaat_id_saya()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_jemaat uuid;
  v_wajib boolean;
begin
  select p.jemaat_id, p.wajib_ganti_password into v_jemaat, v_wajib
  from public.profiles p
  where p.id = auth.uid();
  if v_jemaat is null then
    raise exception using
      errcode = 'PT403',
      message = 'Akun ini belum terhubung ke data jemaat.',
      hint = 'Portal Jemaat hanya untuk akun yang terhubung ke data jemaat.';
  end if;
  if v_wajib then
    raise exception using
      errcode = 'PT428',
      message = 'Ganti password sementara terlebih dahulu.';
  end if;
  return v_jemaat;
end;
$$;

revoke all on function portal._jemaat_id_saya() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Login throttle buckets
-- ---------------------------------------------------------------------------

-- As in 0034, plus:
--   login_fail_akun: 5 wrong passwords per 15 minutes per account, whichever
--                    tab was used (the subject is the auth email; a username
--                    maps to its internal email first), then locked until the
--                    oldest of them is 15 minutes old;
--   login_fail_ip:   30 wrong passwords per 15 minutes per IP (a
--                    congregation may share one network).
create or replace function private.auth_throttle_limits(p_bucket text)
returns table (max_hits int, window_seconds int)
language sql
immutable
set search_path = ''
as $$
  select l.max_hits, l.window_seconds
  from (values
    ('otp_send_email', 1, 60),
    ('otp_send_email', 5, 3600),
    ('otp_send_ip', 20, 3600),
    ('otp_fail_email', 5, 900),
    ('otp_fail_ip', 30, 900),
    ('login_fail_akun', 5, 900),
    ('login_fail_ip', 30, 900)
  ) as l (bucket, max_hits, window_seconds)
  where l.bucket = p_bucket;
$$;

revoke all on function private.auth_throttle_limits(text) from public;
