-- Stage 14d (migration 0039): Portal Jemaat username accounts (brief §18.7).
-- profiles.username / wajib_ganti_password, the account-creation trigger,
-- siapkan_reset_password, selesai_ganti_password_sementara, PT428 on the
-- portal functions, and the login throttle buckets.
begin;
create extension if not exists pgtap with schema extensions;

select plan(65);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres). Rolled back at the end.
-- ---------------------------------------------------------------------------
insert into public.jemaat (id, nama) values
  ('4d000000-0000-4000-8000-0000000000a1', 'Uji Yohanes Santoso'),
  ('4d000000-0000-4000-8000-0000000000a2', 'Uji Sri'),
  ('4d000000-0000-4000-8000-0000000000a3', 'Uji Bebas'),
  ('4d000000-0000-4000-8000-0000000000a4', 'Uji Pengurus Jemaat'),
  ('4d000000-0000-4000-8000-0000000000a5', 'Uji Belum Punya Akun');

-- Accounts: super_admin, panitia, viewer, editor, admin, a staff account
-- that is also a jemaat, a jemaat-only email account, an account with
-- neither.
insert into auth.users (id, email) values
  ('4d000000-0000-4000-8000-000000000001', 'uji-super@test.local'),
  ('4d000000-0000-4000-8000-000000000002', 'uji-panitia@test.local'),
  ('4d000000-0000-4000-8000-000000000003', 'uji-viewer@test.local'),
  ('4d000000-0000-4000-8000-000000000004', 'uji-editor@test.local'),
  ('4d000000-0000-4000-8000-000000000005', 'uji-admin@test.local'),
  ('4d000000-0000-4000-8000-000000000006', 'uji-staff-jemaat@test.local'),
  ('4d000000-0000-4000-8000-000000000007', 'uji-jemaat-email@test.local'),
  ('4d000000-0000-4000-8000-000000000008', 'uji-tanpa-akses@test.local');

insert into public.user_roles (user_id, role_id)
select u.id, r.id
from (values
  ('4d000000-0000-4000-8000-000000000001'::uuid, 'super_admin'),
  ('4d000000-0000-4000-8000-000000000002'::uuid, 'panitia_pemilihan'),
  ('4d000000-0000-4000-8000-000000000003'::uuid, 'viewer'),
  ('4d000000-0000-4000-8000-000000000004'::uuid, 'editor'),
  ('4d000000-0000-4000-8000-000000000005'::uuid, 'admin'),
  ('4d000000-0000-4000-8000-000000000006'::uuid, 'viewer')
) as u (id, role)
join public.roles r on r.name = u.role;

update public.profiles set jemaat_id = '4d000000-0000-4000-8000-0000000000a4'
where id = '4d000000-0000-4000-8000-000000000006';
update public.profiles set jemaat_id = '4d000000-0000-4000-8000-0000000000a3'
where id = '4d000000-0000-4000-8000-000000000007';

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------
select col_type_is('public', 'profiles', 'username', 'extensions', 'citext', 'profiles.username is citext');
select col_is_null('public', 'profiles', 'username', 'username is optional (email accounts have none)');
select col_not_null('public', 'profiles', 'wajib_ganti_password', 'wajib_ganti_password is not null');
select col_default_is('public', 'profiles', 'wajib_ganti_password', 'false', 'wajib_ganti_password defaults to false');
select is(
  (select count(*)::int from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_username_key' and contype = 'u'),
  1, 'username is unique'
);
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'username', 'update')
  and not has_column_privilege('authenticated', 'public.profiles', 'wajib_ganti_password', 'update'),
  'authenticated may not update username or wajib_ganti_password'
);

select is(
  (select array_agg(p.proname::text order by p.proname)
   from pg_proc p
   where p.oid in (
     'private.handle_new_portal_user()'::regprocedure,
     'public.siapkan_reset_password(uuid)'::regprocedure,
     'public.selesai_ganti_password_sementara()'::regprocedure,
     'portal._jemaat_id_saya()'::regprocedure
   ) and p.prosecdef and p.proconfig = array['search_path=""']),
  array['_jemaat_id_saya', 'handle_new_portal_user', 'selesai_ganti_password_sementara', 'siapkan_reset_password'],
  'the new and changed functions are security definer with an empty search_path'
);
select ok(
  has_function_privilege('authenticated', 'public.siapkan_reset_password(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.selesai_ganti_password_sementara()', 'execute')
  and not has_function_privilege('anon', 'public.siapkan_reset_password(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.selesai_ganti_password_sementara()', 'execute')
  and not has_function_privilege('service_role', 'public.siapkan_reset_password(uuid)', 'execute'),
  'the two RPCs: authenticated only'
);
select ok(
  not has_function_privilege('authenticated', 'private.handle_new_portal_user()', 'execute')
  and not has_function_privilege('anon', 'private.username_terlarang(text)', 'execute'),
  'the trigger function is not callable by the API roles, and anon can''t run the word check'
);
-- The CHECK runs with the writer's privileges: a plain profile update by a
-- signed-in user must still work.
set local request.jwt.claims = '{"sub":"4d000000-0000-4000-8000-000000000003","role":"authenticated"}';
set local role authenticated;
select lives_ok(
  $$ update public.profiles set full_name = 'Uji Viewer Baru' where id = auth.uid() $$,
  'a signed-in user can still update their own full_name (the CHECK''s function is executable)'
);
reset role;

-- ---------------------------------------------------------------------------
-- Format (profiles_username_check)
-- ---------------------------------------------------------------------------
create temporary table uji_username (nilai text, ok boolean) on commit drop;
insert into uji_username values
  ('yohanes.santoso', true), ('sri', true), ('budi2', true), ('a1.b2.c3', true), (repeat('x', 30), true),
  ('administrasi', true),
  ('Budi', false), ('BUDI.SANTOSO', false), ('ab', false), (repeat('x', 31), false), ('budi..santoso', false),
  ('.budi', false), ('budi.', false), ('budi_santoso', false), ('budi santoso', false), ('budí', false),
  ('admin', false), ('admin2', false), ('gkp.admin', false), ('root', false), ('Admin', false), ('sekretariat9', false);

create function pg_temp.username_diterima(p text) returns boolean language plpgsql as $$
begin
  update public.profiles set username = p where id = '4d000000-0000-4000-8000-000000000008';
  update public.profiles set username = null where id = '4d000000-0000-4000-8000-000000000008';
  return true;
exception when check_violation then
  return false;
end;
$$;

select is(
  (select array_agg(nilai order by nilai) from uji_username where pg_temp.username_diterima(nilai) <> ok),
  null, 'the CHECK accepts exactly the valid usernames (lowercase a–z0–9 segments, 3–30, no reserved word)'
);

-- Unique, and compared without case (citext).
update public.profiles set username = 'uji.unik' where id = '4d000000-0000-4000-8000-000000000008';
select throws_ok(
  $$ update public.profiles set username = 'uji.unik' where id = '4d000000-0000-4000-8000-000000000003' $$,
  '23505', null::text, 'a username is used once'
);
select is(
  (select count(*)::int from public.profiles where username = 'UJI.UNIK'),
  1, 'lookups ignore case'
);
update public.profiles set username = null where id = '4d000000-0000-4000-8000-000000000008';

select is(
  private.username_kata_terlarang() @> array['admin', 'root', 'sekretariat', 'panitia', 'pengurus'],
  true, 'the reserved list includes the staff words'
);

-- ---------------------------------------------------------------------------
-- The creation trigger (GoTrue writes app_metadata in a second statement)
-- ---------------------------------------------------------------------------

-- 1) Like GoTrue: insert, then app_metadata in an UPDATE.
insert into auth.users (id, email, raw_app_meta_data) values
  ('4d000000-0000-4000-8000-000000000011', 'uji.santoso@masuk.gkp.test', '{"provider":"email"}');
update auth.users
set raw_app_meta_data = raw_app_meta_data
  || '{"portal_username":"uji.santoso","portal_jemaat_id":"4d000000-0000-4000-8000-0000000000a1"}'
where id = '4d000000-0000-4000-8000-000000000011';
select results_eq(
  $$ select username::text, jemaat_id, full_name, wajib_ganti_password from public.profiles
     where id = '4d000000-0000-4000-8000-000000000011' $$,
  $$ values ('uji.santoso'::text, '4d000000-0000-4000-8000-0000000000a1'::uuid, 'Uji Yohanes Santoso'::text, true) $$,
  'GoTrue''s app_metadata update makes a username account: username, jemaat, its name, must change password'
);

-- 2) Keys already present on insert work too.
insert into auth.users (id, email, raw_app_meta_data) values
  ('4d000000-0000-4000-8000-000000000012', 'uji.sri@masuk.gkp.test',
   '{"portal_username":"uji.sri","portal_jemaat_id":"4d000000-0000-4000-8000-0000000000a2"}');
select is(
  (select username::text from public.profiles where id = '4d000000-0000-4000-8000-000000000012'),
  'uji.sri', 'keys on insert work as well'
);

-- 3) Later app_metadata changes do nothing.
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"providers":["email"]}'
where id = '4d000000-0000-4000-8000-000000000011';
update public.profiles set wajib_ganti_password = false where id = '4d000000-0000-4000-8000-000000000011';
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"portal_username":"lain.lagi"}'
where id = '4d000000-0000-4000-8000-000000000011';
select results_eq(
  $$ select username::text, wajib_ganti_password from public.profiles where id = '4d000000-0000-4000-8000-000000000011' $$,
  $$ values ('uji.santoso'::text, false) $$,
  'a later app_metadata change never renames the account or turns the flag back on'
);
update public.profiles set wajib_ganti_password = true where id = '4d000000-0000-4000-8000-000000000011';

-- 4) Refusals roll the auth user back too.
select throws_ok(
  $$ insert into auth.users (id, email, raw_app_meta_data) values
     ('4d000000-0000-4000-8000-000000000013', 'uji.dua@masuk.gkp.test',
      '{"portal_username":"uji.dua","portal_jemaat_id":"4d000000-0000-4000-8000-0000000000a1"}') $$,
  '23505', 'Jemaat ini sudah terhubung ke akun lain.', 'a jemaat that already has an account refuses'
);
select throws_ok(
  $$ insert into auth.users (id, email, raw_app_meta_data) values
     ('4d000000-0000-4000-8000-000000000014', 'uji.santoso2@masuk.gkp.test',
      '{"portal_username":"uji.santoso","portal_jemaat_id":"4d000000-0000-4000-8000-0000000000a5"}') $$,
  '22023', 'Email akun tidak sesuai dengan username.', 'the email must be the username''s'
);
select throws_ok(
  $$ insert into auth.users (id, email, raw_app_meta_data) values
     ('4d000000-0000-4000-8000-000000000015', 'admin@masuk.gkp.test',
      '{"portal_username":"admin","portal_jemaat_id":"4d000000-0000-4000-8000-0000000000a5"}') $$,
  '23514', null::text, 'a reserved word refuses'
);
select throws_ok(
  $$ insert into auth.users (id, email, raw_app_meta_data) values
     ('4d000000-0000-4000-8000-000000000016', 'uji.tiga@masuk.gkp.test',
      '{"portal_username":"uji.tiga","portal_jemaat_id":"4d000000-0000-4000-8000-0000000000ff"}') $$,
  'P0002', 'Jemaat tidak ditemukan.', 'an unknown jemaat refuses'
);
select is(
  (select count(*)::int from auth.users where id in (
    '4d000000-0000-4000-8000-000000000013', '4d000000-0000-4000-8000-000000000014',
    '4d000000-0000-4000-8000-000000000015', '4d000000-0000-4000-8000-000000000016')),
  0, 'no auth user is left behind by a refusal'
);

-- 5) A plain account is untouched.
select results_eq(
  $$ select username, wajib_ganti_password from public.profiles where id = '4d000000-0000-4000-8000-000000000008' $$,
  $$ values (null::extensions.citext, false) $$,
  'an account without the keys stays an ordinary account'
);

-- ---------------------------------------------------------------------------
-- What a jemaat can do to its own row
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"4d000000-0000-4000-8000-000000000011","role":"authenticated"}';
set local role authenticated;
select throws_ok(
  $$ update public.profiles set wajib_ganti_password = false where id = '4d000000-0000-4000-8000-000000000011' $$,
  '42501', null::text, 'a jemaat cannot clear the flag by updating the profile'
);
select throws_ok(
  $$ update public.profiles set username = 'nama.lain' where id = '4d000000-0000-4000-8000-000000000011' $$,
  '42501', null::text, 'nor rename itself'
);
select results_eq(
  $$ select username::text, wajib_ganti_password from public.profiles where id = auth.uid() $$,
  $$ values ('uji.santoso'::text, true) $$,
  'but can read its own username and flag'
);

-- PT428 from every portal function while the flag is on.
select throws_ok($$ select * from portal.profil_saya() $$, 'PT428', 'Ganti password sementara terlebih dahulu.', 'profil_saya refuses with PT428');
select throws_ok($$ select * from portal.keluarga_saya() $$, 'PT428', null::text, 'keluarga_saya too');
select throws_ok($$ select * from portal.pemilihan_aktif_saya() $$, 'PT428', null::text, 'pemilihan_aktif_saya too');
select throws_ok(
  $$ select * from portal.berikan_suara(gen_random_uuid(), '{}'::uuid[], '{}'::uuid[]) $$,
  'PT428', null::text, 'and berikan_suara, before anything else'
);
select throws_ok(
  $$ select portal.ajukan_perubahan('{"pekerjaan":"Guru"}'::jsonb) $$,
  'PT428', null::text, 'and ajukan_perubahan'
);

-- The forced change clears its own flag only.
select lives_ok($$ select public.selesai_ganti_password_sementara() $$, 'selesai_ganti_password_sementara runs');
select is(
  (select wajib_ganti_password from public.profiles where id = auth.uid()),
  false, 'it cleared the caller''s flag'
);
select lives_ok($$ select * from portal.profil_saya() $$, 'portal functions work again afterwards');
reset role;
select is(
  (select wajib_ganti_password from public.profiles where id = '4d000000-0000-4000-8000-000000000012'),
  true, 'another account''s flag is untouched'
);

-- A staff account without a jemaat still gets PT403, not PT428.
update public.profiles set wajib_ganti_password = true where id = '4d000000-0000-4000-8000-000000000003';
set local request.jwt.claims = '{"sub":"4d000000-0000-4000-8000-000000000003","role":"authenticated"}';
set local role authenticated;
select throws_ok($$ select * from portal.profil_saya() $$, 'PT403', null::text, 'no jemaat link is still PT403');
reset role;
update public.profiles set wajib_ganti_password = false where id = '4d000000-0000-4000-8000-000000000003';

set local role anon;
select throws_ok($$ select public.selesai_ganti_password_sementara() $$, '42501', null::text, 'anon cannot call selesai_ganti_password_sementara');
select throws_ok($$ select * from public.siapkan_reset_password('4d000000-0000-4000-8000-000000000012') $$, '42501', null::text, 'nor siapkan_reset_password');
reset role;

-- ---------------------------------------------------------------------------
-- siapkan_reset_password: users:update, or pemilihan:update, for
-- jemaat-only accounts
-- ---------------------------------------------------------------------------
insert into auth.sessions (id, user_id) values
  ('4d000000-0000-4000-8000-0000000000e1', '4d000000-0000-4000-8000-000000000012'),
  ('4d000000-0000-4000-8000-0000000000e2', '4d000000-0000-4000-8000-000000000012'),
  ('4d000000-0000-4000-8000-0000000000e3', '4d000000-0000-4000-8000-000000000011');
update public.profiles set wajib_ganti_password = false where id = '4d000000-0000-4000-8000-000000000012';

create function pg_temp.sebagai(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

-- Without the permission: refused before anything about the target.
select pg_temp.sebagai('4d000000-0000-4000-8000-000000000003');
set local role authenticated;
select throws_ok($$ select * from public.siapkan_reset_password('4d000000-0000-4000-8000-000000000012') $$, '42501', 'Kamu tidak punya akses untuk tindakan ini.', 'viewer: refused');
select throws_ok($$ select * from public.siapkan_reset_password(gen_random_uuid()) $$, '42501', null::text, 'viewer: refused even for an unknown id (learns nothing)');
reset role;
select pg_temp.sebagai('4d000000-0000-4000-8000-000000000004');
set local role authenticated;
select throws_ok($$ select * from public.siapkan_reset_password('4d000000-0000-4000-8000-000000000012') $$, '42501', null::text, 'editor: refused');
reset role;
select pg_temp.sebagai('4d000000-0000-4000-8000-000000000005');
set local role authenticated;
select throws_ok($$ select * from public.siapkan_reset_password('4d000000-0000-4000-8000-000000000012') $$, '42501', null::text, 'admin (no users:update): refused');
reset role;
select pg_temp.sebagai('4d000000-0000-4000-8000-000000000011');
set local role authenticated;
select throws_ok($$ select * from public.siapkan_reset_password('4d000000-0000-4000-8000-000000000012') $$, '42501', null::text, 'a jemaat: refused');
reset role;
select is(
  (select wajib_ganti_password from public.profiles where id = '4d000000-0000-4000-8000-000000000012'),
  false, 'nothing changed after the refusals'
);
select is(
  (select count(*)::int from auth.sessions where user_id = '4d000000-0000-4000-8000-000000000012'),
  2, 'and no session was revoked'
);

-- Panitia (pemilihan:update): jemaat-only accounts.
select pg_temp.sebagai('4d000000-0000-4000-8000-000000000002');
set local role authenticated;
select results_eq(
  $$ select nama, username, email from public.siapkan_reset_password('4d000000-0000-4000-8000-000000000012') $$,
  $$ values ('Uji Sri'::text, 'uji.sri'::text, 'uji.sri@masuk.gkp.test'::text) $$,
  'panitia resets a username account; returns the jemaat''s name, the username, and the auth email for the log'
);
select results_eq(
  $$ select nama, username from public.siapkan_reset_password('4d000000-0000-4000-8000-000000000007') $$,
  $$ values ('Uji Bebas'::text, null::text) $$,
  'and a jemaat-only email account'
);
select throws_ok(
  $$ select * from public.siapkan_reset_password('4d000000-0000-4000-8000-000000000006') $$,
  '22023', 'Password akun pengurus tidak bisa direset dari sini.', 'not a staff account, even one linked to a jemaat'
);
select throws_ok(
  $$ select * from public.siapkan_reset_password('4d000000-0000-4000-8000-000000000001') $$,
  '22023', 'Hanya akun jemaat yang bisa direset passwordnya.', 'not a staff account without a jemaat'
);
select throws_ok(
  $$ select * from public.siapkan_reset_password('4d000000-0000-4000-8000-000000000008') $$,
  '22023', 'Hanya akun jemaat yang bisa direset passwordnya.', 'not an account without access'
);
select throws_ok(
  $$ select * from public.siapkan_reset_password('4d000000-0000-4000-8000-000000000002') $$,
  '22023', 'Password akun sendiri tidak bisa direset dari sini.', 'not your own account'
);
select throws_ok(
  $$ select * from public.siapkan_reset_password('4d000000-0000-4000-8000-0000000000ff') $$,
  'P0002', 'Pengguna tidak ditemukan.', 'an unknown account is not found'
);
reset role;
select is(
  (select wajib_ganti_password from public.profiles where id = '4d000000-0000-4000-8000-000000000012'),
  true, 'the reset turned the flag on'
);
select is(
  (select count(*)::int from auth.sessions where user_id = '4d000000-0000-4000-8000-000000000012'),
  0, 'and revoked every session of that account'
);
select is(
  (select count(*)::int from auth.sessions where user_id = '4d000000-0000-4000-8000-000000000011'),
  1, 'but no other account''s'
);

-- super_admin (users:update): the same rule.
select pg_temp.sebagai('4d000000-0000-4000-8000-000000000001');
set local role authenticated;
select lives_ok(
  $$ select * from public.siapkan_reset_password('4d000000-0000-4000-8000-000000000011') $$,
  'super_admin resets a jemaat-only account'
);
select throws_ok(
  $$ select * from public.siapkan_reset_password('4d000000-0000-4000-8000-000000000006') $$,
  '22023', null::text, 'super_admin cannot reset a staff account here either'
);
reset role;

-- ---------------------------------------------------------------------------
-- Login throttle buckets
-- ---------------------------------------------------------------------------
select results_eq(
  $$ select max_hits, window_seconds from private.auth_throttle_limits('login_fail_akun') $$,
  $$ values (5, 900) $$, 'login_fail_akun: 5 per 15 minutes'
);
select results_eq(
  $$ select max_hits, window_seconds from private.auth_throttle_limits('login_fail_ip') $$,
  $$ values (30, 900) $$, 'login_fail_ip: 30 per 15 minutes'
);
select is(
  (select count(*)::int from private.auth_throttle_limits('otp_send_email')),
  2, 'the 0034 buckets are kept'
);

set local role anon;
select is(
  public.auth_throttle(array['login_fail_akun', 'login_fail_ip'], array[repeat('a', 64), repeat('b', 64)], false),
  0, 'a fresh account and IP may try'
);
select is(
  (select max(public.auth_throttle(array['login_fail_akun', 'login_fail_ip'], array[repeat('a', 64), repeat('b', 64)], true))
   from generate_series(1, 5)),
  0, 'five wrong passwords are recorded'
);
select cmp_ok(
  public.auth_throttle(array['login_fail_akun', 'login_fail_ip'], array[repeat('a', 64), repeat('b', 64)], false),
  '>', 850, 'the sixth try waits about 15 minutes (locked)'
);
select is(
  public.auth_throttle(array['login_fail_akun', 'login_fail_ip'], array[repeat('c', 64), repeat('b', 64)], false),
  0, 'another account from the same IP may still try'
);
reset role;

-- The IP limit: 30 failures across accounts.
insert into private.auth_throttle_events (bucket, subject, created_at)
select 'login_fail_ip', repeat('d', 64), now() - interval '1 minute' from generate_series(1, 30);
set local role anon;
select cmp_ok(
  public.auth_throttle(array['login_fail_akun', 'login_fail_ip'], array[repeat('e', 64), repeat('d', 64)], false),
  '>', 0, 'after 30 failures from one IP, every account from it waits'
);
reset role;

select * from finish();
rollback;
