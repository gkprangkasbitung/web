-- The public "Jadwal Ibadah" page (brief §8: "optionally ... the coming week's
-- peribadahan_items"): the next 7 days, today through today + 6 in
-- Asia/Jakarta.
--
-- Like the 0020 functions, the range is computed here and the function takes
-- no parameters, so anon can't page through the whole schedule history.
-- It returns the schedule columns only: people by name, and no attendance,
-- catatan, or SMKA grid (a coming service has none of those, and the page
-- doesn't show them). It reuses private.schedule_rows, so ordering and name
-- resolution match public_warta_schedule exactly.

create or replace function public.public_jadwal_mendatang()
returns table (
  id uuid,
  tanggal date,
  jam time,
  sort_order int,
  category_key text,
  category_name text,
  tempat_nama text,
  wilayah_nama text,
  dpa text,
  tema text,
  pelayan_firman_nama text,
  liturgos_nama text,
  pemusik_nama text,
  bahan_alkitab text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    s.tanggal,
    s.jam,
    s.sort_order,
    s.category_key,
    s.category_name,
    s.tempat_nama,
    s.wilayah_nama,
    s.dpa,
    s.tema,
    s.pelayan_firman_nama,
    s.liturgos_nama,
    s.pemusik_nama,
    s.bahan_alkitab
  from (select (now() at time zone 'Asia/Jakarta')::date as today) as t
  cross join lateral private.schedule_rows(t.today, t.today + 6) as s;
$$;

-- Same grant pattern as 0020: Supabase's default privileges grant EXECUTE to
-- every API role, so revoke from all of them, then grant exactly what's needed.
revoke all on function public.public_jadwal_mendatang() from public, anon, authenticated, service_role;
grant execute on function public.public_jadwal_mendatang() to anon, authenticated;
