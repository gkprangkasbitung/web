-- LOCAL DEVELOPMENT ONLY. Applied by `supabase start` / `supabase db reset`
-- on the local stack; never push this to the production project.
--
-- One test account per seeded role plus one without any role, all with the
-- password "password123":
--   superadmin@gkp.test  super_admin
--   admin@gkp.test       admin
--   editor@gkp.test      editor
--   viewer@gkp.test      viewer
--   tanpa-role@gkp.test  (no role)
--
-- Below the accounts: a small set of sample data. Every name, number,
-- address, and amount is FICTIONAL (marked "Contoh"); none of it describes
-- the real congregation. Dates are relative to today in Asia/Jakarta, so
-- after every reset there is a published warta for this week.

with accounts (id, email, full_name, role_name) as (
  values
    ('00000000-0000-4000-8000-000000000001'::uuid, 'superadmin@gkp.test', 'Super Admin Lokal', 'super_admin'),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'admin@gkp.test', 'Admin Lokal', 'admin'),
    ('00000000-0000-4000-8000-000000000003'::uuid, 'editor@gkp.test', 'Editor Lokal', 'editor'),
    ('00000000-0000-4000-8000-000000000004'::uuid, 'viewer@gkp.test', 'Viewer Lokal', 'viewer'),
    ('00000000-0000-4000-8000-000000000005'::uuid, 'tanpa-role@gkp.test', null, null)
),
new_users as (
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, reauthentication_token
  )
  select
    '00000000-0000-0000-0000-000000000000', a.id, 'authenticated', 'authenticated', a.email,
    extensions.crypt('password123', extensions.gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    case when a.full_name is null then '{}'::jsonb else jsonb_build_object('full_name', a.full_name) end,
    now(), now(), '', '', '', '', '', ''
  from accounts a
  returning id, email
)
insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now()
from new_users u;

insert into public.user_roles (user_id, role_id)
select a.id, r.id
from (
  values
    ('00000000-0000-4000-8000-000000000001'::uuid, 'super_admin'),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'admin'),
    ('00000000-0000-4000-8000-000000000003'::uuid, 'editor'),
    ('00000000-0000-4000-8000-000000000004'::uuid, 'viewer')
) as a (id, role_name)
join public.roles r on r.name = a.role_name;

-- ---------------------------------------------------------------------------
-- Sample data (fictional)
-- ---------------------------------------------------------------------------
do $$
declare
  -- This week's Sunday in Asia/Jakarta (today when today is a Sunday).
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_minggu date := v_today - extract(dow from v_today)::int;
  v_admin uuid := '00000000-0000-4000-8000-000000000002';
  v_editor uuid := '00000000-0000-4000-8000-000000000003';
  v_tempat_a uuid;
  v_tempat_b uuid;
  v_wilayah_1 uuid;
  v_wilayah_2 uuid;
  v_label_pf uuid;
  v_label_liturgos uuid;
  v_label_pemusik uuid;
  v_label_majelis uuid;
  v_kel_1 uuid;
  v_kel_2 uuid;
  v_andi uuid;
  v_bunga uuid;
  v_dewi uuid;
  v_fitri uuid;
  v_warta uuid;
  v_draft uuid;
  v_smka uuid;
begin
  -- Master data
  insert into public.tempat (nama, keterangan, sort_order)
  values ('Contoh Tempat A', 'Alamat contoh A', 0) returning id into v_tempat_a;
  insert into public.tempat (nama, keterangan, sort_order)
  values ('Contoh Tempat B', 'Alamat contoh B', 1) returning id into v_tempat_b;

  insert into public.wilayah (nama, sort_order) values ('Contoh Wilayah 1', 0) returning id into v_wilayah_1;
  insert into public.wilayah (nama, sort_order) values ('Contoh Wilayah 2', 1) returning id into v_wilayah_2;

  insert into public.label_jemaat (nama, sort_order) values ('Pelayan Firman', 0) returning id into v_label_pf;
  insert into public.label_jemaat (nama, sort_order) values ('Liturgos', 1) returning id into v_label_liturgos;
  insert into public.label_jemaat (nama, sort_order) values ('Pemusik', 2) returning id into v_label_pemusik;
  insert into public.label_jemaat (nama, sort_order) values ('Majelis Jemaat', 3) returning id into v_label_majelis;

  -- Families and members
  insert into public.keluarga (nama) values ('Kel. Contoh Satu') returning id into v_kel_1;
  insert into public.keluarga (nama) values ('Kel. Contoh Dua') returning id into v_kel_2;

  insert into public.jemaat (
    nama, nomor_anggota, jenis_kelamin, status_keanggotaan, wilayah_id, pekerjaan, alamat, no_hp,
    tanggal_lahir, tanggal_masuk, keluarga_id, hubungan_keluarga
  ) values (
    'Andi Contoh', 'CONTOH-0001', 'laki_laki', 'anggota_penuh', v_wilayah_1, 'Pekerjaan contoh',
    'Jl. Contoh No. 1', '080000000001', '1970-01-01', '2000-01-01', v_kel_1, 'Kepala Keluarga'
  ) returning id into v_andi;

  insert into public.jemaat (
    nama, nomor_anggota, jenis_kelamin, status_keanggotaan, wilayah_id, alamat, no_hp,
    tanggal_lahir, keluarga_id, hubungan_keluarga
  ) values (
    'Bunga Contoh', 'CONTOH-0002', 'perempuan', 'sidi', v_wilayah_1,
    'Jl. Contoh No. 1', '080000000002', '1972-02-02', v_kel_1, 'Istri'
  ) returning id into v_bunga;

  insert into public.jemaat (
    nama, nomor_anggota, jenis_kelamin, status_keanggotaan, wilayah_id, alamat,
    tanggal_lahir, keluarga_id, hubungan_keluarga
  ) values (
    'Candra Contoh', 'CONTOH-0003', 'laki_laki', 'baptis_anak', v_wilayah_1,
    'Jl. Contoh No. 1', '2015-03-03', v_kel_1, 'Anak'
  );

  insert into public.jemaat (
    nama, nomor_anggota, jenis_kelamin, status_keanggotaan, wilayah_id, pekerjaan, alamat, no_hp,
    tanggal_lahir, tanggal_masuk, keluarga_id, hubungan_keluarga
  ) values (
    'Dewi Contoh', 'CONTOH-0004', 'perempuan', 'anggota_penuh', v_wilayah_2, 'Pekerjaan contoh',
    'Jl. Contoh No. 2', '080000000004', '1980-04-04', '2010-04-04', v_kel_2, 'Kepala Keluarga'
  ) returning id into v_dewi;

  insert into public.jemaat (
    nama, nomor_anggota, jenis_kelamin, status_keanggotaan, wilayah_id, alamat, keluarga_id, hubungan_keluarga
  ) values (
    'Eko Contoh', 'CONTOH-0005', 'laki_laki', 'simpatisan', v_wilayah_2, 'Jl. Contoh No. 2', v_kel_2, 'Anak'
  );

  insert into public.jemaat (nama, nomor_anggota, jenis_kelamin, status_keanggotaan, no_hp)
  values ('Fitri Contoh', 'CONTOH-0006', 'perempuan', 'sidi', '080000000006')
  returning id into v_fitri;

  insert into public.jemaat_labels (jemaat_id, label_id) values
    (v_andi, v_label_pf),
    (v_andi, v_label_majelis),
    (v_bunga, v_label_liturgos),
    (v_dewi, v_label_liturgos),
    (v_dewi, v_label_pemusik),
    (v_fitri, v_label_pf);

  insert into public.jemaat_catatan_pastoral (jemaat_id, jenis, tanggal, penulis_id, penulis_nama, isi)
  values (v_andi, 'Kunjungan', v_minggu - 3, v_editor, 'Editor Lokal', 'Catatan pastoral contoh.');

  -- Warta: published for this week, draft for next week
  insert into public.warta (
    slug, status, tanggal_kebaktian, judul_kebaktian, tema_kebaktian,
    renungan_judul, renungan_kitab, renungan_isi, renungan_sumber, created_by, published_at
  ) values (
    to_char(v_minggu, 'YYYY-MM-DD') || '-contoh-warta-minggu-ini', 'published', v_minggu,
    'Contoh Warta Minggu Ini', 'Tema contoh', 'Judul renungan contoh', 'Mazmur 23:1-6',
    E'Paragraf pertama renungan contoh.\nBaris kedua renungan contoh.', 'Sumber contoh', v_editor, now()
  ) returning id into v_warta;

  insert into public.warta (slug, status, tanggal_kebaktian, judul_kebaktian, tema_kebaktian, created_by)
  values (
    to_char(v_minggu + 7, 'YYYY-MM-DD') || '-contoh-warta-draft', 'draft', v_minggu + 7,
    'Contoh Warta Draft', 'Tema contoh', v_editor
  ) returning id into v_draft;

  insert into public.warta_litbang_items (warta_id, litbang_category_id, name, deskripsi, sort_order)
  select w.id, c.id, c.name, c.deskripsi, c.sort_order
  from public.litbang_categories c
  cross join (values (v_warta), (v_draft)) as w (id)
  where c.active;

  insert into public.warta_kesaksian_items (warta_id, judul, deskripsi, sort_order)
  values (v_warta, 'Kesaksian contoh', 'Deskripsi kesaksian contoh.', 0);

  -- Peribadahan in this week's service week, plus next Sunday
  insert into public.peribadahan_items (
    category_id, tanggal, jam, tempat_id, pelayan_firman_id, liturgos_id,
    kehadiran_laki_laki, kehadiran_perempuan, kehadiran_anak, catatan, sort_order
  ) values (
    (select id from public.peribadahan_categories where key = 'umum'), v_minggu, '07:00',
    v_tempat_a, v_andi, v_bunga, 10, 12, 5, 'Keterangan contoh', 0
  );

  insert into public.peribadahan_items (
    category_id, tanggal, jam, tema, liturgos_id, pemusik_id, bahan_alkitab, sort_order
  ) values (
    (select id from public.peribadahan_categories where key = 'smka'), v_minggu, '09:00',
    'Tema SMKA contoh', v_dewi, v_bunga, 'Bahan alkitab contoh', 1
  ) returning id into v_smka;

  insert into public.peribadahan_smka_kelompok (item_id, kelompok, pf_id, laki_laki, perempuan) values
    (v_smka, 'batita', v_fitri, 1, 2),
    (v_smka, 'balita', null, null, null),
    (v_smka, 'kecil', null, null, null),
    (v_smka, 'tanggung', null, null, null),
    (v_smka, 'besar', v_andi, 3, 4),
    (v_smka, 'tunas_remaja', null, null, null),
    (v_smka, 'guru_sekolah_minggu', null, 1, 2),
    (v_smka, 'orang_tua', null, null, null);

  insert into public.peribadahan_items (
    category_id, tanggal, jam, tempat_id, wilayah_id, dpa, tema, pelayan_firman_id, liturgos_id, catatan, sort_order
  ) values (
    (select id from public.peribadahan_categories where key = 'krt'), v_minggu + 3, '19:00',
    v_tempat_b, v_wilayah_1, 'DPA contoh', 'Tema KRT contoh', v_andi, v_bunga, 'Catatan contoh', 0
  );

  insert into public.peribadahan_items (
    category_id, tanggal, jam, tempat_id, dpa, tema, pelayan_firman_id, liturgos_id, sort_order
  ) values (
    (select id from public.peribadahan_categories where key = 'pa'), v_minggu + 4, '19:00',
    v_tempat_a, 'DPA contoh', 'Tema PA contoh', v_fitri, v_dewi, 0
  );

  insert into public.peribadahan_items (category_id, tanggal, jam, tempat_id, sort_order)
  values ((select id from public.peribadahan_categories where key = 'umum'), v_minggu + 7, '07:00', v_tempat_a, 0);

  -- Sarana & Dana: opening balances, and transactions before, inside, and
  -- after this week's finance week (v_minggu - 7 .. v_minggu - 1)
  update public.sarana_dana_items set saldo_awal = 1000000, keterangan = 'Data contoh' where key = 'kas_jemaat';
  update public.sarana_dana_items set saldo_awal = 500000, keterangan = 'Data contoh' where key = 'kas_sarana_prasarana';
  update public.sarana_dana_items set saldo_awal = 0, keterangan = 'Data contoh' where key = 'persembahan_bulanan';

  insert into public.sarana_dana_transactions (item_id, tanggal, tipe, jumlah, keterangan, jemaat_id, created_by)
  select i.id, t.tanggal, t.tipe, t.jumlah, t.keterangan, t.jemaat_id, v_admin
  from (
    values
      ('kas_jemaat', v_minggu - 10, 'masuk', 200000, 'Pemasukan contoh', null::uuid),
      ('kas_jemaat', v_minggu - 7, 'masuk', 300000, 'Persembahan contoh', null),
      ('kas_jemaat', v_minggu - 4, 'keluar', 75000, 'Pengeluaran contoh', null),
      ('kas_jemaat', v_minggu - 1, 'masuk', 100000, 'Pemasukan contoh', null),
      ('kas_jemaat', v_minggu + 1, 'keluar', 50000, 'Pengeluaran contoh', null),
      ('kas_sarana_prasarana', v_minggu - 5, 'keluar', 125000, 'Pengeluaran contoh', null),
      ('persembahan_bulanan', v_minggu - 6, 'masuk', 150000, 'Persembahan bulanan contoh', v_andi),
      ('persembahan_bulanan', v_minggu - 3, 'masuk', 250000, 'Persembahan bulanan contoh', v_dewi)
  ) as t (item_key, tanggal, tipe, jumlah, keterangan, jemaat_id)
  join public.sarana_dana_items i on i.key = t.item_key;
end;
$$;
