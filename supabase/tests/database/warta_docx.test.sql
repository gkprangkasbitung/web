-- Stage 12b (brief §16.2–16.3): warta_docx_gereja(), the Warta DOCX left
-- column. It answers to `warta:read` (the DOCX route's permission), not to
-- `situs:read`, and returns only what the warta prints.
begin;
create extension if not exists pgtap with schema extensions;

select plan(10);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres). Rolled back at the end.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('36000000-0000-4000-8000-000000000001', 'docx-warta-only@test.local'),
  ('36000000-0000-4000-8000-000000000002', 'docx-no-role@test.local');

-- A role with warta:read and nothing else: no situs:read, so the Profil
-- Gereja and Pendeta tables stay closed to it.
insert into public.roles (id, name) values ('36000000-0000-4000-8000-0000000000b1', 'uji_warta_only');
insert into public.role_permissions (role_id, permission_id)
select '36000000-0000-4000-8000-0000000000b1', p.id
from public.permissions p
where p.resource = 'warta' and p.action = 'read';
insert into public.user_roles (user_id, role_id) values
  ('36000000-0000-4000-8000-000000000001', '36000000-0000-4000-8000-0000000000b1');

update public.profil_gereja set alamat = 'Jl. Uji 1', email = 'uji@example.test' where id = 1;
update public.profil_gereja_rekening set nama_bank = 'Bank Uji', nomor_rekening = '123-456', atas_nama = 'GKP Uji' where id = 1;
insert into public.profil_gereja_jadwal_rutin (nama, keterangan_waktu, sort_order) values
  ('Uji Kebaktian B', 'Sabtu', 901),
  ('Uji Kebaktian A', 'Minggu', 900);

insert into public.pendeta (id, nama, peran, tahun_mulai, tahun_selesai, no_hp, tampil_di_warta) values
  ('36000000-0000-4000-8000-0000000000e1', 'Pdt. Uji Melayani', 'Pendeta Jemaat', 2020, null, '081200000001', true),
  ('36000000-0000-4000-8000-0000000000e2', 'Pdt. Uji Tidak Di Warta', 'Pendeta Jemaat', 2021, null, '081200000002', false),
  ('36000000-0000-4000-8000-0000000000e3', 'Pdt. Uji Selesai', 'Pendeta Jemaat', 2000, 2010, '081200000003', true);

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok($$ select public.warta_docx_gereja() $$, '42501', null::text, 'anon cannot call it');
reset role;

set local request.jwt.claims = '{"sub":"36000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;
select throws_ok($$ select public.warta_docx_gereja() $$, '42501', null::text, 'a signed-in user without warta:read is refused');
reset role;

-- ---------------------------------------------------------------------------
-- warta:read only: the function answers, the tables stay closed
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"36000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

select is(public.warta_docx_gereja() -> 'profil' ->> 'alamat', 'Jl. Uji 1', 'profil alamat comes back for warta:read');
select is(public.warta_docx_gereja() -> 'rekening' ->> 'nomor_rekening', '123-456', 'rekening comes back for warta:read');
select is(
  (select array_agg(x ->> 'nama') from jsonb_array_elements(public.warta_docx_gereja() -> 'jadwal_rutin') x
   where x ->> 'nama' like 'Uji Kebaktian %'),
  array['Uji Kebaktian A', 'Uji Kebaktian B'],
  'jadwal_rutin is ordered by sort_order'
);
select ok(
  public.warta_docx_gereja() -> 'pendeta' @> '[{"nama":"Pdt. Uji Melayani","no_hp":"081200000001"}]'::jsonb,
  'a currently serving pastor with tampil_di_warta is listed with no_hp'
);
select ok(
  not (public.warta_docx_gereja() -> 'pendeta' @> '[{"nama":"Pdt. Uji Tidak Di Warta"}]'::jsonb),
  'a pastor with tampil_di_warta = false is left out'
);
select ok(
  not (public.warta_docx_gereja() -> 'pendeta' @> '[{"nama":"Pdt. Uji Selesai"}]'::jsonb),
  'a pastor who no longer serves is left out'
);
select is(
  (select array_agg(k order by k) from jsonb_object_keys(public.warta_docx_gereja() -> 'pendeta' -> 0) k),
  array['nama', 'no_hp'],
  'pastors carry only nama and no_hp'
);
select is((select count(*) from public.pendeta)::int, 0, 'the pendeta table itself stays closed without situs:read');
reset role;

select * from finish();
rollback;
