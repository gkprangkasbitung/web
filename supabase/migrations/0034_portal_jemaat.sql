-- Stage 11f: Portal login (Portal Jemaat with an email code, separate from
-- the admin).
--
-- Access itself needs no schema change: "staff" = at least one user_roles
-- row, "jemaat" = profiles.jemaat_id set, and both are decided on the server
-- (lib/auth/portal.ts). RLS is unchanged: an account without a role still
-- has no permission, so it reads nothing from jemaat, keluarga, or the
-- finance tables over REST.
--
-- 1. get_my_jemaat(): the caller's own linked jemaat, name only. jemaat is
--    readable only with warta:read (0019), so a jemaat-only account could
--    not otherwise greet itself by name on /jemaat. SECURITY DEFINER but
--    scoped strictly to auth.uid(), like get_my_access() (0018).
-- 2. auth_throttle(): the app's own limits on sending and verifying email
--    codes, on top of Supabase Auth's limits. Supabase sees every request
--    from the app server's IP, so its per-IP limits can't tell visitors
--    apart; these limits key on the visitor's IP and the email instead.
--    - Events live in private.auth_throttle_events (schema not exposed by
--      the API). Subjects are SHA-256 hex digests computed by the app, so no
--      email or IP address is stored here.
--    - The limits are fixed per bucket inside the function; callers can't
--      pass their own.
--    - Executable by anon, because the app calls it before anyone is signed
--      in and the service-role key is reserved for invites and deletes
--      (brief §3). Calling it directly can only use up quota, the same as
--      submitting the form; it can't read anything or lift a limit.

-- ---------------------------------------------------------------------------
-- 1. get_my_jemaat()
-- ---------------------------------------------------------------------------

create or replace function public.get_my_jemaat()
returns table (id uuid, nama text)
language sql
stable
security definer
set search_path = ''
as $$
  select j.id, j.nama
  from public.profiles p
  join public.jemaat j on j.id = p.jemaat_id
  where p.id = auth.uid();
$$;

revoke all on function public.get_my_jemaat() from public, anon;
grant execute on function public.get_my_jemaat() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. auth_throttle()
-- ---------------------------------------------------------------------------

create table private.auth_throttle_events (
  id bigint generated always as identity primary key,
  bucket text not null,
  subject text not null constraint auth_throttle_events_subject_check check (subject ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

create index auth_throttle_events_lookup_idx on private.auth_throttle_events (bucket, subject, created_at desc);
create index auth_throttle_events_created_at_idx on private.auth_throttle_events (created_at);

-- Not reachable through the API (private schema, no grants); RLS on anyway.
alter table private.auth_throttle_events enable row level security;
revoke all on private.auth_throttle_events from public, anon, authenticated;

-- (max_hits, window_seconds) pairs per bucket. Every pair must hold.
--   otp_send_email: 1 per minute and 5 per hour per email
--   otp_send_ip:    20 per hour per IP (a congregation may share one network)
--   otp_fail_email: 5 wrong codes per 15 minutes per email
--   otp_fail_ip:    30 wrong codes per 15 minutes per IP
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
    ('otp_fail_ip', 30, 900)
  ) as l (bucket, max_hits, window_seconds)
  where l.bucket = p_bucket;
$$;

revoke all on function private.auth_throttle_limits(text) from public;

-- Seconds until every (bucket, subject) pair is under all of its limits; 0
-- when allowed now. With p_record, an allowed call also records one event
-- per pair (all or nothing). The pairs are locked in a fixed order, so two
-- concurrent calls for the same email can't both pass a limit of 1.
create or replace function public.auth_throttle(p_buckets text[], p_subjects text[], p_record boolean)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count int := coalesce(array_length(p_buckets, 1), 0);
  v_retry int := 0;
  v_pair record;
  v_limit record;
  v_nth timestamptz;
begin
  if v_count = 0 or v_count > 4 or v_count <> coalesce(array_length(p_subjects, 1), 0) or p_record is null then
    raise exception 'Data yang dikirim tidak valid.' using errcode = '22023';
  end if;

  for v_pair in
    select b.bucket, s.subject
    from unnest(p_buckets) with ordinality as b (bucket, n)
    join unnest(p_subjects) with ordinality as s (subject, n) using (n)
    order by b.bucket, s.subject
  loop
    if v_pair.subject is null or v_pair.subject !~ '^[0-9a-f]{64}$'
       or not exists (select 1 from private.auth_throttle_limits(v_pair.bucket)) then
      raise exception 'Data yang dikirim tidak valid.' using errcode = '22023';
    end if;

    perform pg_advisory_xact_lock(hashtextextended('auth_throttle:' || v_pair.bucket || ':' || v_pair.subject, 0));

    for v_limit in select * from private.auth_throttle_limits(v_pair.bucket) loop
      -- The max_hits-th newest event inside the window: once it ages out of
      -- the window, there is room for one more.
      select e.created_at into v_nth
      from private.auth_throttle_events e
      where e.bucket = v_pair.bucket
        and e.subject = v_pair.subject
        and e.created_at > now() - make_interval(secs => v_limit.window_seconds)
      order by e.created_at desc
      offset v_limit.max_hits - 1
      limit 1;

      if v_nth is not null then
        v_retry := greatest(
          v_retry,
          ceil(extract(epoch from (v_nth + make_interval(secs => v_limit.window_seconds) - now())))::int,
          1
        );
      end if;
    end loop;
  end loop;

  if v_retry = 0 and p_record then
    insert into private.auth_throttle_events (bucket, subject)
    select b.bucket, s.subject
    from unnest(p_buckets) with ordinality as b (bucket, n)
    join unnest(p_subjects) with ordinality as s (subject, n) using (n);

    -- The longest window is an hour; keep a day for debugging, then drop.
    delete from private.auth_throttle_events where created_at < now() - interval '1 day';
  end if;

  return v_retry;
end;
$$;

revoke all on function public.auth_throttle(text[], text[], boolean) from public;
grant execute on function public.auth_throttle(text[], text[], boolean) to anon, authenticated;
