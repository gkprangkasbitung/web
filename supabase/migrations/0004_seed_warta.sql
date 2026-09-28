-- Adds the "warta" permission set and grants it to the default roles, then
-- seeds the fixed Peribadahan / Litbang / Sarana & Dana rows. Safe to re-run.

insert into public.permissions (resource, action, description) values
  ('warta', 'create', 'warta:create'),
  ('warta', 'read', 'warta:read'),
  ('warta', 'update', 'warta:update'),
  ('warta', 'delete', 'warta:delete')
on conflict (resource, action) do nothing;

-- Re-run the super_admin "everything" grant so the new warta permissions are
-- included too (existing pairs are skipped via ON CONFLICT).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.name = 'super_admin'
on conflict do nothing;

-- admin: full CRUD on warta, same as its existing announcements/content access.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.resource = 'warta'
where r.name = 'admin'
on conflict do nothing;

-- editor: create/read/update, no delete.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.resource = 'warta' and p.action in ('create', 'read', 'update')
where r.name = 'editor'
on conflict do nothing;

-- viewer: read-only.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.resource = 'warta' and p.action = 'read'
where r.name = 'viewer'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Fixed seed rows
-- ---------------------------------------------------------------------------
insert into public.peribadahan_categories (key, name, sort_order) values
  ('umum', 'Umum', 1),
  ('smka', 'SMKA', 2),
  ('krt', 'KRT', 3),
  ('pa', 'PA', 4),
  ('lansia', 'Lansia', 5),
  ('perempuan', 'Perempuan', 6),
  ('pria', 'Pria', 7),
  ('doa_pagi', 'Doa Pagi', 8),
  ('pemuda_remaja', 'Pemuda Remaja', 9)
on conflict (key) do nothing;

insert into public.litbang_categories (key, name, sort_order) values
  ('katekisasi_dasar_lanjutan', 'Katekisasi Dasar & Lanjutan', 1),
  ('katekisasi_khusus_pranikah', 'Katekisasi Khusus & PraNikah', 2),
  ('persiapan_gsm', 'Persiapan Guru Sekolah Minggu (GSM)', 3),
  ('kunjungan_rutin', 'Kunjungan Rutin', 4),
  ('paduan_suara', 'Paduan Suara', 5)
on conflict (key) do nothing;

insert into public.sarana_dana_items (key, name, nominal) values
  ('kas_jemaat', 'Kas Jemaat', 0),
  ('kas_sarana_prasarana', 'Kas Sarana dan Prasarana', 0),
  ('persembahan_bulanan', 'Persembahan Bulanan', 0)
on conflict (key) do nothing;
