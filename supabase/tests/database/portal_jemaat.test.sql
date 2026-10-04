-- Portal login (stage 11f; migration 0034): get_my_jemaat() and auth_throttle().
-- Also: an account linked to a jemaat but without a role still reads nothing
-- from the church tables (RLS unchanged).
begin;
create extension if not exists pgtap with schema extensions;

select plan(30);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres). Rolled back at the end.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('2f000000-0000-4000-8000-000000000001', 'portal-jemaat@test.local'),
  ('2f000000-0000-4000-8000-000000000002', 'portal-staff@test.local');

insert into public.jemaat (id, nama) values
  ('2f000000-0000-4000-8000-0000000000a1', 'Uji Jemaat Portal'),
  ('2f000000-0000-4000-8000-0000000000a2', 'Uji Jemaat Lain');

update public.profiles set jemaat_id = '2f000000-0000-4000-8000-0000000000a1'
where id = '2f000000-0000-4000-8000-000000000001';

insert into public.user_roles (user_id, role_id)
select '2f000000-0000-4000-8000-000000000002', id from public.roles where name = 'viewer';

insert into public.keluarga (nama) values ('Uji Keluarga Portal');

-- ---------------------------------------------------------------------------
-- get_my_jemaat()
-- ---------------------------------------------------------------------------
select is(
  (select prosecdef from pg_proc where oid = 'public.get_my_jemaat()'::regprocedure),
  true, 'get_my_jemaat is security definer'
);
select is(
  (select proconfig from pg_proc where oid = 'public.get_my_jemaat()'::regprocedure),
  array['search_path=""'], 'get_my_jemaat has an empty search_path'
);

set local role anon;
select throws_ok($$ select * from public.get_my_jemaat() $$, '42501', null::text, 'anon cannot call get_my_jemaat');
reset role;

-- The jemaat-only account: its own jemaat's name, nothing else.
set local request.jwt.claims = '{"sub":"2f000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;
select results_eq(
  $$ select id, nama from public.get_my_jemaat() $$,
  $$ values ('2f000000-0000-4000-8000-0000000000a1'::uuid, 'Uji Jemaat Portal'::text) $$,
  'get_my_jemaat returns only the caller''s own jemaat, name only'
);
select is(
  (select array_to_string(proargnames, ',') from pg_proc where oid = 'public.get_my_jemaat()'::regprocedure),
  'id,nama', 'returns only id and nama'
);

-- RLS unchanged: no role → no warta:read → nothing from the church tables.
select is((select count(*) from public.jemaat), 0::bigint, 'a jemaat-only account reads no jemaat rows, not even its own');
select is((select count(*) from public.keluarga), 0::bigint, 'nor keluarga');
select is((select count(*) from public.sarana_dana_transactions), 0::bigint, 'nor finance transactions');
select is((select count(*) from public.sarana_dana_balances), 0::bigint, 'nor finance balances');
select is((select count(*) from public.peribadahan_items), 0::bigint, 'nor the worship schedule');
select is((select count(*) from public.user_roles), 0::bigint, 'nor role assignments');
select is((select count(*) from public.profiles), 1::bigint, 'only its own profile');
select throws_ok(
  $$ select * from public.sarana_dana_report('2026-01-01'::date, '2026-01-07'::date) $$,
  '42501', null::text, 'and cannot run the finance report'
);
reset role;

-- A staff account without a jemaat link: no rows.
set local request.jwt.claims = '{"sub":"2f000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;
select is((select count(*) from public.get_my_jemaat()), 0::bigint, 'an account without a jemaat link gets no row');
reset role;

-- ---------------------------------------------------------------------------
-- auth_throttle()
-- ---------------------------------------------------------------------------
select is(
  (select prosecdef from pg_proc where oid = 'public.auth_throttle(text[], text[], boolean)'::regprocedure),
  true, 'auth_throttle is security definer'
);

set local role anon;
select throws_ok(
  $$ select count(*) from private.auth_throttle_events $$,
  '42501', null::text, 'anon cannot read the throttle events'
);
select throws_ok(
  $$ select public.auth_throttle(array['otp_send_email'], array['not-a-hash'], true) $$,
  '22023', 'Data yang dikirim tidak valid.', 'a subject that is not a SHA-256 hex digest is refused'
);
select throws_ok(
  $$ select public.auth_throttle(array['bebas'], array[repeat('a', 64)], true) $$,
  '22023', 'Data yang dikirim tidak valid.', 'an unknown bucket is refused (callers cannot pick their own limits)'
);
select throws_ok(
  $$ select public.auth_throttle(array['otp_send_email', 'otp_send_ip'], array[repeat('a', 64)], true) $$,
  '22023', 'Data yang dikirim tidak valid.', 'mismatched arrays are refused'
);

-- One send per email per minute.
select is(public.auth_throttle(array['otp_send_email'], array[repeat('1', 64)], true), 0, 'anon may send the first code');
select is(public.auth_throttle(array['otp_send_email'], array[repeat('1', 64)], true), 60, 'a second send within the minute waits 60 s');
select is(public.auth_throttle(array['otp_send_email'], array[repeat('2', 64)], true), 0, 'another email is not affected');

-- All or nothing: a blocked pair records nothing for the other pair.
select is(
  public.auth_throttle(array['otp_send_email', 'otp_send_ip'], array[repeat('1', 64), repeat('3', 64)], true),
  60, 'a blocked email blocks the whole send'
);
select is(public.auth_throttle(array['otp_send_ip'], array[repeat('3', 64)], false), 0, '...and recorded nothing for its IP');

-- Five wrong codes per email per 15 minutes: the sixth try is refused.
select is(public.auth_throttle(array['otp_fail_email'], array[repeat('4', 64)], true), 0, 'wrong code 1 recorded');
select is(public.auth_throttle(array['otp_fail_email'], array[repeat('4', 64)], true), 0, 'wrong code 2 recorded');
select is(public.auth_throttle(array['otp_fail_email'], array[repeat('4', 64)], true), 0, 'wrong code 3 recorded');
select is(public.auth_throttle(array['otp_fail_email'], array[repeat('4', 64)], true), 0, 'wrong code 4 recorded');
select is(public.auth_throttle(array['otp_fail_email'], array[repeat('4', 64)], true), 0, 'wrong code 5 recorded');
select is(public.auth_throttle(array['otp_fail_email'], array[repeat('4', 64)], false), 900, 'after 5 wrong codes, the next try waits 15 minutes');
reset role;

select * from finish();
rollback;
