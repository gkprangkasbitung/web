-- Stage 10 (0028): activity_logs is append-only for every role, including
-- the service role and the table owner, except the FK's own set-null when an
-- account is deleted. A signed-in user's row always carries their own email.
-- search_activity_logs matches activity or email with a bound parameter.
begin;
create extension if not exists pgtap with schema extensions;

select plan(26);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres). Rolled back at the end.
--   L  holds activity_log:read (a custom role)
--   U  no role
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('17000000-0000-4000-8000-00000000000a', 'uji-log-l@test.local'),
  ('17000000-0000-4000-8000-00000000000b', 'uji-log-u@test.local');

insert into public.roles (id, name) values ('17000000-0000-4000-8000-0000000000e1', 'uji_pembaca_log');
insert into public.role_permissions (role_id, permission_id)
select '17000000-0000-4000-8000-0000000000e1', id from public.permissions where resource = 'activity_log' and action = 'read';
insert into public.user_roles (user_id, role_id) values
  ('17000000-0000-4000-8000-00000000000a', '17000000-0000-4000-8000-0000000000e1');

-- Rows written without a user identity keep the given values (seed, tests).
insert into public.activity_logs (id, user_id, user_email, module, activity, ip_address, created_at) values
  ('17000000-0000-4000-8000-0000000000c1', '17000000-0000-4000-8000-00000000000b', 'uji-log-u@test.local',
   'warta', 'Uji17 cari A%B', '192.0.2.1', '2031-02-01T16:30:00Z'),
  ('17000000-0000-4000-8000-0000000000c2', null, 'uji17-lain@test.local',
   'roles', 'Uji17 cari AXB', '192.0.2.2', '2031-02-01T17:30:00Z');

select is(
  (select created_at from public.activity_logs where id = '17000000-0000-4000-8000-0000000000c1'),
  '2031-02-01T16:30:00Z'::timestamptz,
  'without a user identity, created_at is kept as given'
);

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
select ok(
  not has_table_privilege('authenticated', 'public.activity_logs', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.activity_logs', 'DELETE')
    and not has_table_privilege('authenticated', 'public.activity_logs', 'TRUNCATE'),
  'authenticated has no update, delete, or truncate privilege'
);

select ok(
  not has_table_privilege('service_role', 'public.activity_logs', 'UPDATE')
    and not has_table_privilege('service_role', 'public.activity_logs', 'DELETE')
    and not has_table_privilege('service_role', 'public.activity_logs', 'TRUNCATE'),
  'service_role has no update, delete, or truncate privilege'
);

select ok(
  not has_table_privilege('anon', 'public.activity_logs', 'INSERT')
    and not has_table_privilege('anon', 'public.activity_logs', 'UPDATE')
    and not has_table_privilege('anon', 'public.activity_logs', 'DELETE'),
  'anon cannot write at all'
);

-- ---------------------------------------------------------------------------
-- U (signed in, no role): insert own rows only, with the real email
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"17000000-0000-4000-8000-00000000000b","role":"authenticated"}';
set local role authenticated;

select lives_ok(
  $$ insert into public.activity_logs (id, user_id, user_email, module, activity, created_at)
     values ('17000000-0000-4000-8000-0000000000c3', auth.uid(), 'palsu@example.com', 'akun',
             'Uji17 email palsu', '2000-01-01T00:00:00Z') $$,
  'a user can insert a row for themselves'
);

select throws_ok(
  $$ insert into public.activity_logs (user_id, user_email, module, activity)
     values ('17000000-0000-4000-8000-00000000000a', 'uji-log-l@test.local', 'akun', 'Uji17 atas nama orang lain') $$,
  '42501', null,
  'a row attributed to another user is refused by RLS'
);

select throws_ok(
  $$ update public.activity_logs set activity = 'diubah' where user_id = auth.uid() $$,
  '42501', null,
  'a user cannot update their own rows'
);

select throws_ok(
  $$ delete from public.activity_logs where user_id = auth.uid() $$,
  '42501', null,
  'a user cannot delete their own rows'
);

-- ---------------------------------------------------------------------------
-- L (activity_log:read): reads, but cannot change anything either
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub":"17000000-0000-4000-8000-00000000000a","role":"authenticated"}';
set local role authenticated;

select results_eq(
  $$ select user_email, created_at > now() - interval '1 minute'
     from public.activity_logs where id = '17000000-0000-4000-8000-0000000000c3' $$,
  $$ values ('uji-log-u@test.local'::text, true) $$,
  'the stored email and time are the real ones, not the client''s'
);

select throws_ok(
  $$ update public.activity_logs set activity = 'diubah' where id = '17000000-0000-4000-8000-0000000000c1' $$,
  '42501', null,
  'a reader cannot update rows'
);

select throws_ok(
  $$ delete from public.activity_logs where id = '17000000-0000-4000-8000-0000000000c1' $$,
  '42501', null,
  'a reader cannot delete rows'
);

-- Search: '\%' is what escapeLike produces for a literal '%'.
select results_eq(
  $$ select id from public.search_activity_logs('A\%B') where activity like 'Uji17%' $$,
  $$ values ('17000000-0000-4000-8000-0000000000c1'::uuid) $$,
  'an escaped % matches literally, not as a wildcard'
);

select results_eq(
  $$ select id from public.search_activity_logs('a%b') where activity like 'Uji17%' order by created_at $$,
  $$ values ('17000000-0000-4000-8000-0000000000c1'::uuid), ('17000000-0000-4000-8000-0000000000c2'::uuid) $$,
  'unescaped, % is a wildcard (so the caller must escape)'
);

select results_eq(
  $$ select id from public.search_activity_logs('UJI17-LAIN@') $$,
  $$ values ('17000000-0000-4000-8000-0000000000c2'::uuid) $$,
  'the email is searched too, case-insensitively'
);

select lives_ok(
  $$ select * from public.search_activity_logs('x),activity.eq.y,(module.eq.z') $$,
  'commas and parentheses in the search are just text'
);

select ok(
  (select count(*) from public.search_activity_logs(null)) = (select count(*) from public.activity_logs),
  'an empty search returns every row the caller may read'
);

reset role;
set local request.jwt.claims = '{"sub":"17000000-0000-4000-8000-00000000000b","role":"authenticated"}';
set local role authenticated;

select is(
  (select count(*)::int from public.search_activity_logs(null)),
  0,
  'without activity_log:read the search returns nothing (RLS)'
);

reset role;
set local request.jwt.claims = '';
set local role anon;

select throws_ok(
  $$ select * from public.search_activity_logs(null) $$,
  '42501', null,
  'anon cannot call search_activity_logs'
);

-- ---------------------------------------------------------------------------
-- service_role (bypasses RLS) and postgres (the owner)
-- ---------------------------------------------------------------------------
reset role;
set local role service_role;

select throws_ok(
  $$ update public.activity_logs set activity = 'diubah' where id = '17000000-0000-4000-8000-0000000000c1' $$,
  '42501', null,
  'the service role cannot update rows'
);

select throws_ok(
  $$ delete from public.activity_logs where id = '17000000-0000-4000-8000-0000000000c1' $$,
  '42501', null,
  'the service role cannot delete rows'
);

reset role;

select throws_ok(
  $$ update public.activity_logs set activity = 'diubah' where id = '17000000-0000-4000-8000-0000000000c1' $$,
  '42501', 'Log aktivitas tidak bisa diubah atau dihapus.',
  'even the table owner cannot update rows (trigger)'
);

select throws_ok(
  $$ delete from public.activity_logs where id = '17000000-0000-4000-8000-0000000000c1' $$,
  '42501', 'Log aktivitas tidak bisa diubah atau dihapus.',
  'even the table owner cannot delete rows (trigger)'
);

select throws_ok(
  $$ truncate public.activity_logs $$,
  '42501', 'Log aktivitas tidak bisa diubah atau dihapus.',
  'even the table owner cannot truncate'
);

select throws_ok(
  $$ update public.activity_logs set user_id = null, activity = 'diubah' where id = '17000000-0000-4000-8000-0000000000c1' $$,
  '42501', 'Log aktivitas tidak bisa diubah atau dihapus.',
  'clearing user_id together with another column is refused'
);

-- ---------------------------------------------------------------------------
-- Deleting an account keeps its log rows, with user_id cleared
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ delete from auth.users where id = '17000000-0000-4000-8000-00000000000b' $$,
  'an account with log rows can be deleted'
);

select results_eq(
  $$ select user_id, user_email, activity from public.activity_logs
     where id in ('17000000-0000-4000-8000-0000000000c1', '17000000-0000-4000-8000-0000000000c3') order by activity $$,
  $$ values (null::uuid, 'uji-log-u@test.local'::text, 'Uji17 cari A%B'::text),
            (null::uuid, 'uji-log-u@test.local'::text, 'Uji17 email palsu'::text) $$,
  'its rows stay, with user_id null and everything else unchanged'
);

select * from finish();
rollback;
