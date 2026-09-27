alter table public.jemaat
  add column if not exists jenis_kelamin text check (jenis_kelamin in ('laki_laki', 'perempuan')),
  add column if not exists alamat text,
  add column if not exists wilayah_id uuid references public.wilayah (id) on delete set null,
  add column if not exists no_hp text,
  add column if not exists tanggal_lahir date,
  add column if not exists tanggal_masuk date,
  add column if not exists sudah_baptis boolean not null default false,
  add column if not exists sudah_sidi boolean not null default false;
