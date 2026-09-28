-- Brief §12.1: anon reads only published warta (with their Litbang and
-- Kesaksian rows). Personal data, the schedule tables, and the finance tables
-- need a signed-in user with warta:read.
begin;
create extension if not exists pgtap with schema extensions;

select plan(55);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres). Rolled back at the end.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('10000000-0000-4000-8000-000000000001', 'rls-viewer@test.local'),
  ('10000000-0000-4000-8000-000000000002', 'rls-tanpa-role@test.local');

insert into public.user_roles (user_id, role_id)
select '10000000-0000-4000-8000-000000000001', id from public.roles where name = 'viewer';

insert into public.tempat (id, nama) values ('10000000-0000-4000-8000-0000000000c1', 'Uji Tempat');
insert into public.wilayah (id, nama) values ('10000000-0000-4000-8000-0000000000c2', 'Uji Wilayah');
insert into public.keluarga (id, nama) values ('10000000-0000-4000-8000-0000000000c3', 'Uji Keluarga RLS');
insert into public.label_jemaat (id, nama) values ('10000000-0000-4000-8000-0000000000c4', 'Uji Label RLS');
insert into public.jemaat (id, nama, no_hp, alamat, keluarga_id)
values ('10000000-0000-4000-8000-0000000000a1', 'Uji Jemaat', '0800', 'Jl. Uji', '10000000-0000-4000-8000-0000000000c3');
insert into public.jemaat_labels (jemaat_id, label_id)
values ('10000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000c4');

insert into public.peribadahan_items (id, category_id, tanggal, tempat_id)
select '10000000-0000-4000-8000-0000000000d1', id, '2030-01-06', '10000000-0000-4000-8000-0000000000c1'
from public.peribadahan_categories where key = 'smka';
insert into public.peribadahan_smka_kelompok (item_id, kelompok, laki_laki)
values ('10000000-0000-4000-8000-0000000000d1', 'batita', 1);

insert into public.sarana_dana_transactions (item_id, tanggal, tipe, jumlah, jemaat_id)
select id, '2030-01-01', 'masuk', 1000, '10000000-0000-4000-8000-0000000000a1'
from public.sarana_dana_items where key = 'persembahan_bulanan';

insert into public.warta (id, slug, status, tanggal_kebaktian, judul_kebaktian) values
  ('10000000-0000-4000-8000-0000000000b1', 'uji-rls-published', 'published', '2030-01-06', 'Uji Published'),
  ('10000000-0000-4000-8000-0000000000b2', 'uji-rls-draft', 'draft', '2030-01-13', 'Uji Draft');
insert into public.warta_kesaksian_items (warta_id, judul) values
  ('10000000-0000-4000-8000-0000000000b1', 'Kesaksian published'),
  ('10000000-0000-4000-8000-0000000000b2', 'Kesaksian draft');
insert into public.warta_litbang_items (warta_id, name) values
  ('10000000-0000-4000-8000-0000000000b1', 'Litbang published'),
  ('10000000-0000-4000-8000-0000000000b2', 'Litbang draft');

-- ---------------------------------------------------------------------------
-- Schema-level checks
-- ---------------------------------------------------------------------------
select is_empty(
  $$ select c.relname from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relrowsecurity $$,
  'RLS is enabled on every table in public'
);

select ok(
  (select 'security_invoker=true' = any (c.reloptions) from pg_class c where c.oid = 'public.sarana_dana_balances'::regclass),
  'sarana_dana_balances runs with the caller''s rights'
);

-- ---------------------------------------------------------------------------
-- anon
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"role":"anon"}';
set local role anon;

select throws_ok(
  format('select * from public.%I', t),
  '42501',
  null::text,
  format('anon cannot read %s', t)
)
from unnest(array[
  'jemaat', 'keluarga', 'sarana_dana_transactions', 'sarana_dana_items', 'sarana_dana_balances',
  'jemaat_labels', 'label_jemaat', 'tempat', 'wilayah',
  'peribadahan_categories', 'peribadahan_items', 'peribadahan_smka_kelompok',
  'litbang_categories', 'jemaat_catatan_pastoral', 'activity_logs',
  'profiles', 'roles', 'permissions', 'role_permissions', 'user_roles'
]) as t;

select results_eq(
  $$ select slug from public.warta where slug like 'uji-rls-%' $$,
  $$ values ('uji-rls-published') $$,
  'anon reads published warta only'
);

select results_eq(
  $$ select judul from public.warta_kesaksian_items
     where warta_id in ('10000000-0000-4000-8000-0000000000b1', '10000000-0000-4000-8000-0000000000b2') $$,
  $$ values ('Kesaksian published') $$,
  'anon reads Kesaksian of published warta only'
);

select results_eq(
  $$ select name from public.warta_litbang_items
     where warta_id in ('10000000-0000-4000-8000-0000000000b1', '10000000-0000-4000-8000-0000000000b2') $$,
  $$ values ('Litbang published') $$,
  'anon reads Litbang of published warta only'
);

-- ---------------------------------------------------------------------------
-- Signed in, but without any role (so without warta:read)
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;

select is_empty(
  format('select 1 from public.%I', t),
  format('a user without warta:read sees no rows in %s', t)
)
from unnest(array[
  'jemaat', 'keluarga', 'sarana_dana_transactions', 'sarana_dana_items', 'sarana_dana_balances',
  'jemaat_labels', 'label_jemaat', 'tempat', 'wilayah',
  'peribadahan_categories', 'peribadahan_items', 'peribadahan_smka_kelompok'
]) as t;

select results_eq(
  $$ select slug from public.warta where slug like 'uji-rls-%' $$,
  $$ values ('uji-rls-published') $$,
  'a user without warta:read sees published warta only'
);

-- ---------------------------------------------------------------------------
-- Viewer (warta:read)
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

select isnt_empty(
  format('select 1 from public.%I', t),
  format('viewer reads %s', t)
)
from unnest(array[
  'jemaat', 'keluarga', 'sarana_dana_transactions', 'sarana_dana_items', 'sarana_dana_balances',
  'jemaat_labels', 'label_jemaat', 'tempat', 'wilayah',
  'peribadahan_categories', 'peribadahan_items', 'peribadahan_smka_kelompok'
]) as t;

select results_eq(
  $$ select slug from public.warta where slug like 'uji-rls-%' order by slug $$,
  $$ values ('uji-rls-draft'), ('uji-rls-published') $$,
  'viewer reads draft warta too'
);

-- profiles: only the name and avatar of your own row stay writable.
select throws_ok(
  $$ update public.profiles set jemaat_id = '10000000-0000-4000-8000-0000000000a1' where id = auth.uid() $$,
  '42501',
  null::text,
  'a user cannot link their own profile to a jemaat directly'
);

select throws_ok(
  $$ update public.profiles set email = 'lain@test.local' where id = auth.uid() $$,
  '42501',
  null::text,
  'a user cannot change the email on their own profile directly'
);

select lives_ok(
  $$ update public.profiles set full_name = 'Nama Baru' where id = auth.uid() $$,
  'a user can still update their own full_name'
);

reset role;
set local request.jwt.claims = '';

select is(
  (select full_name from public.profiles where id = '10000000-0000-4000-8000-000000000001'),
  'Nama Baru',
  'the full_name update was saved'
);

select * from finish();
rollback;
