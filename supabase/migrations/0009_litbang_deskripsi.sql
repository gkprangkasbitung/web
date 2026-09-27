-- Bidang Litbang moves from structured Hari/Jam/Tempat/Petugas fields to a
-- single free-text `deskripsi` per category, since in practice each
-- category needs its own paragraph/bullet list (e.g. "Katekisasi Dasar
-- setiap Sabtu di Ruang Konsistori pkl 17.00; Katekisasi Lanjutan setiap
-- Jumat...") rather than one fixed schedule per row.

alter table public.litbang_categories
  add column deskripsi text,
  drop column if exists hari,
  drop column if exists jam,
  drop column if exists tempat,
  drop column if exists petugas;

alter table public.warta_litbang_items
  add column deskripsi text,
  drop column if exists hari,
  drop column if exists jam,
  drop column if exists tempat,
  drop column if exists petugas;
