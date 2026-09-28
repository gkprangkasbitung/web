-- The public site's only view of the schedule and the finance report (brief
-- §8, §12.1). After 0019 anon can no longer read peribadahan_*, jemaat, or
-- sarana_dana_* directly. These functions return exactly what the public
-- pages show:
--   - the schedule with people's names only, never other jemaat columns;
--   - the finance report as per-item aggregates only, never single rows.
--
-- The warta functions take a slug, not a date range. They return rows only
-- for a published warta and compute the range themselves (brief §11):
-- service week = tanggal_kebaktian .. +6 days, finance week = -7 .. -1 days.
-- src/lib/dates.ts (serviceWeek, financeWeek) uses the same arithmetic for
-- the ranges the pages display.
--
-- Shared logic lives in the `private` schema, which PostgREST does not expose
-- and anon/authenticated cannot use. The public functions are SECURITY
-- DEFINER (owned by postgres) so they can read past RLS, with an empty
-- search_path and fully-qualified names.

create schema if not exists private;
revoke all on schema private from public;

comment on schema private is
  'Internal helpers for SECURITY DEFINER functions and triggers. Not exposed through the API.';

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- tanggal_kebaktian of a published warta, or null for a draft or unknown slug.
create or replace function private.published_warta_date(p_slug text)
returns date
language sql
stable
set search_path = ''
as $$
  select w.tanggal_kebaktian
  from public.warta w
  where w.slug = p_slug
    and w.status = 'published';
$$;

-- Schedule rows dated p_start .. p_end, ordered by date then sort_order.
-- People appear by name only. smka_kelompok lists, in the fixed group order,
-- only the groups with any data (a PF, or an L or P count, 0 included).
create or replace function private.schedule_rows(p_start date, p_end date)
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
  bahan_alkitab text,
  kehadiran_laki_laki int,
  kehadiran_perempuan int,
  kehadiran_anak int,
  catatan text,
  smka_kelompok jsonb
)
language sql
stable
set search_path = ''
as $$
  select
    i.id,
    i.tanggal,
    i.jam,
    i.sort_order,
    c.key,
    c.name,
    t.nama,
    w.nama,
    i.dpa,
    i.tema,
    pf.nama,
    lt.nama,
    pm.nama,
    i.bahan_alkitab,
    i.kehadiran_laki_laki,
    i.kehadiran_perempuan,
    i.kehadiran_anak,
    i.catatan,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'kelompok', k.kelompok,
            'pf_nama', kp.nama,
            'laki_laki', k.laki_laki,
            'perempuan', k.perempuan
          )
          order by array_position(
            array[
              'batita', 'balita', 'kecil', 'tanggung', 'besar', 'tunas_remaja',
              'guru_sekolah_minggu', 'orang_tua'
            ]::text[],
            k.kelompok
          )
        )
        from public.peribadahan_smka_kelompok k
        left join public.jemaat kp on kp.id = k.pf_id
        where k.item_id = i.id
          and (k.pf_id is not null or k.laki_laki is not null or k.perempuan is not null)
      ),
      '[]'::jsonb
    )
  from public.peribadahan_items i
  join public.peribadahan_categories c on c.id = i.category_id
  left join public.tempat t on t.id = i.tempat_id
  left join public.wilayah w on w.id = i.wilayah_id
  left join public.jemaat pf on pf.id = i.pelayan_firman_id
  left join public.jemaat lt on lt.id = i.liturgos_id
  left join public.jemaat pm on pm.id = i.pemusik_id
  where i.tanggal between p_start and p_end
  order by i.tanggal, i.sort_order, i.created_at, i.id;
$$;

-- The Sarana & Dana report for p_start .. p_end, per item (brief §9.7):
--   Saldo Awal  = saldo_awal + net of every transaction dated before p_start
--   Pemasukan   = sum of masuk in range
--   Pengeluaran = sum of keluar in range
--   Saldo Akhir = Saldo Awal + Pemasukan - Pengeluaran
-- Transactions after p_end are ignored.
create or replace function private.sarana_dana_report(p_start date, p_end date)
returns table (
  key text,
  name text,
  saldo_awal numeric,
  pemasukan numeric,
  pengeluaran numeric,
  saldo_akhir numeric
)
language sql
stable
set search_path = ''
as $$
  select
    i.key,
    i.name,
    r.saldo_awal,
    r.pemasukan,
    r.pengeluaran,
    r.saldo_awal + r.pemasukan - r.pengeluaran
  from public.sarana_dana_items i
  cross join lateral (
    select
      i.saldo_awal + coalesce(
        sum(case when t.tipe = 'masuk' then t.jumlah else -t.jumlah end) filter (where t.tanggal < p_start),
        0
      ) as saldo_awal,
      coalesce(sum(t.jumlah) filter (where t.tipe = 'masuk' and t.tanggal >= p_start), 0) as pemasukan,
      coalesce(sum(t.jumlah) filter (where t.tipe = 'keluar' and t.tanggal >= p_start), 0) as pengeluaran
    from public.sarana_dana_transactions t
    where t.item_id = i.id
      and t.tanggal <= p_end
  ) r
  order by i.name, i.key;
$$;

revoke all on function private.published_warta_date(text) from public;
revoke all on function private.schedule_rows(date, date) from public;
revoke all on function private.sarana_dana_report(date, date) from public;

-- ---------------------------------------------------------------------------
-- Public functions
-- ---------------------------------------------------------------------------

-- "Bidang Peribadahan" of /warta/[slug]: the service week of a published warta.
create or replace function public.public_warta_schedule(p_slug text)
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
  bahan_alkitab text,
  kehadiran_laki_laki int,
  kehadiran_perempuan int,
  kehadiran_anak int,
  catatan text,
  smka_kelompok jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.*
  from private.published_warta_date(p_slug) as d (tanggal_kebaktian)
  cross join lateral private.schedule_rows(d.tanggal_kebaktian, d.tanggal_kebaktian + 6) as s
  where d.tanggal_kebaktian is not null;
$$;

-- "Bidang Sarana dan Dana" of /warta/[slug]: the finance week before a
-- published warta, as per-item aggregates.
create or replace function public.public_warta_finance(p_slug text)
returns table (
  key text,
  name text,
  saldo_awal numeric,
  pemasukan numeric,
  pengeluaran numeric,
  saldo_akhir numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.*
  from private.published_warta_date(p_slug) as d (tanggal_kebaktian)
  cross join lateral private.sarana_dana_report(d.tanggal_kebaktian - 7, d.tanggal_kebaktian - 1) as r
  where d.tanggal_kebaktian is not null;
$$;

-- This week's schedule for Beranda and Jadwal Ibadah: the Minggu-Sabtu week
-- containing today in Asia/Jakarta (today itself when it is a Sunday).
create or replace function public.public_jadwal_pekan_ini()
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
  bahan_alkitab text,
  kehadiran_laki_laki int,
  kehadiran_perempuan int,
  kehadiran_anak int,
  catatan text,
  smka_kelompok jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.*
  from (
    select today - extract(dow from today)::int as minggu
    from (select (now() at time zone 'Asia/Jakarta')::date as today) as t
  ) as w
  cross join lateral private.schedule_rows(w.minggu, w.minggu + 6) as s;
$$;

-- Supabase's default privileges grant EXECUTE on new functions to anon,
-- authenticated, and service_role directly, so revoking from PUBLIC alone is
-- not enough: revoke from every API role, then grant exactly what is needed.
revoke all on function public.public_warta_schedule(text) from public, anon, authenticated, service_role;
revoke all on function public.public_warta_finance(text) from public, anon, authenticated, service_role;
revoke all on function public.public_jadwal_pekan_ini() from public, anon, authenticated, service_role;

grant execute on function public.public_warta_schedule(text) to anon, authenticated;
grant execute on function public.public_warta_finance(text) to anon, authenticated;
grant execute on function public.public_jadwal_pekan_ini() to anon, authenticated;
