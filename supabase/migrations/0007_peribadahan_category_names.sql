-- Renames the Peribadahan categories to their full display names. `key`
-- stays the same (used in URLs and code), only `name` (shown in the UI)
-- changes.

update public.peribadahan_categories set name = 'Kebaktian Minggu' where key = 'umum';
update public.peribadahan_categories set name = 'Kebaktian SMKA' where key = 'smka';
update public.peribadahan_categories set name = 'Kebaktian Rumah Tangga' where key = 'krt';
update public.peribadahan_categories set name = 'Pemahaman Alkitab' where key = 'pa';
update public.peribadahan_categories set name = 'Kebaktian Lansia' where key = 'lansia';
update public.peribadahan_categories set name = 'Kebaktian Perempuan' where key = 'perempuan';
update public.peribadahan_categories set name = 'Kebaktian Pria' where key = 'pria';
update public.peribadahan_categories set name = 'Doa Pagi' where key = 'doa_pagi';
update public.peribadahan_categories set name = 'Kebaktian Pemuda Remaja' where key = 'pemuda_remaja';
