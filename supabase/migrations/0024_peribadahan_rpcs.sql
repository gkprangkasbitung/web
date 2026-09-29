-- Peribadahan (brief §9.5): a DB-level floor under the Zod ">= 0" attendance
-- check, one atomic RPC for saving an item plus (for Kebaktian SMKA) its
-- 8-group grid in the same transaction, and a search function so the
-- "Cari tema/DPA/catatan..." box on /admin/peribadahan never has to build a
-- PostgREST `.or()` filter string out of user input (commas and parentheses
-- in that string would inject extra filter conditions).

alter table public.peribadahan_items
  add constraint peribadahan_items_kehadiran_check check (
    (kehadiran_laki_laki is null or kehadiran_laki_laki >= 0)
    and (kehadiran_perempuan is null or kehadiran_perempuan >= 0)
    and (kehadiran_anak is null or kehadiran_anak >= 0)
  );

alter table public.peribadahan_smka_kelompok
  add constraint peribadahan_smka_kelompok_count_check check (
    (laki_laki is null or laki_laki >= 0)
    and (perempuan is null or perempuan >= 0)
  );

-- Saves every general field of a schedule row and, for Kebaktian SMKA,
-- upserts its 8-group grid, all in one transaction. The category can't
-- change after creation (brief §9.5), so it isn't a parameter here: it's
-- looked up from the row, and only that decides whether p_smka_kelompok is
-- required or must be absent.
--
-- The app (lib/peribadahan.ts's category layout config) already sends null
-- for every field outside the row's category layout, and never renders
-- inputs for the others; this function's job is only Kebaktian SMKA's grid
-- and the floor on negative attendance, not re-deriving the per-category
-- field list in SQL.
--
-- p_smka_kelompok: a jsonb array of exactly 8
-- {"kelompok", "pf_id", "laki_laki", "perempuan"} objects, one per group in
-- peribadahan_smka_kelompok's check constraint. pf_id is ignored (stored as
-- null) for "guru_sekolah_minggu" and "orang_tua", which have no PF.
create or replace function public.update_peribadahan_item(
  p_id uuid,
  p_jam time default null,
  p_tempat_id uuid default null,
  p_wilayah_id uuid default null,
  p_pelayan_firman_id uuid default null,
  p_liturgos_id uuid default null,
  p_pemusik_id uuid default null,
  p_tema text default null,
  p_dpa text default null,
  p_catatan text default null,
  p_kehadiran_laki_laki int default null,
  p_kehadiran_perempuan int default null,
  p_kehadiran_anak int default null,
  p_bahan_alkitab text default null,
  p_smka_kelompok jsonb default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_key text;
begin
  if not public.has_permission(auth.uid(), 'warta', 'update') then
    raise exception using errcode = '42501', message = 'Kamu tidak punya akses untuk tindakan ini.';
  end if;

  select c.key into v_key
  from public.peribadahan_items i
  join public.peribadahan_categories c on c.id = i.category_id
  where i.id = p_id;

  if v_key is null then
    raise exception using errcode = 'P0002', message = 'Jadwal tidak ditemukan.';
  end if;

  if (p_kehadiran_laki_laki is not null and p_kehadiran_laki_laki < 0)
    or (p_kehadiran_perempuan is not null and p_kehadiran_perempuan < 0)
    or (p_kehadiran_anak is not null and p_kehadiran_anak < 0)
  then
    raise exception using errcode = '22023', message = 'Jumlah kehadiran tidak boleh negatif.';
  end if;

  if v_key = 'smka' then
    if p_smka_kelompok is null or jsonb_array_length(p_smka_kelompok) <> 8 then
      raise exception using errcode = '22023', message = 'Data kelompok SMKA tidak lengkap.';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_smka_kelompok) x
      where x ->> 'kelompok' not in (
        'batita', 'balita', 'kecil', 'tanggung', 'besar', 'tunas_remaja',
        'guru_sekolah_minggu', 'orang_tua'
      )
    ) or (select count(distinct x ->> 'kelompok') from jsonb_array_elements(p_smka_kelompok) x) <> 8
    then
      raise exception using errcode = '22023', message = 'Data kelompok SMKA tidak valid.';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_smka_kelompok) x
      where ((x ->> 'laki_laki') is not null and (x ->> 'laki_laki')::int < 0)
        or ((x ->> 'perempuan') is not null and (x ->> 'perempuan')::int < 0)
    ) then
      raise exception using errcode = '22023', message = 'Jumlah kehadiran tidak boleh negatif.';
    end if;
  elsif p_smka_kelompok is not null then
    raise exception using errcode = '22023', message = 'Data kelompok SMKA tidak berlaku untuk kategori ini.';
  end if;

  update public.peribadahan_items
  set jam = p_jam,
      tempat_id = p_tempat_id,
      wilayah_id = p_wilayah_id,
      pelayan_firman_id = p_pelayan_firman_id,
      liturgos_id = p_liturgos_id,
      pemusik_id = p_pemusik_id,
      tema = p_tema,
      dpa = p_dpa,
      catatan = p_catatan,
      kehadiran_laki_laki = p_kehadiran_laki_laki,
      kehadiran_perempuan = p_kehadiran_perempuan,
      kehadiran_anak = p_kehadiran_anak,
      bahan_alkitab = p_bahan_alkitab,
      updated_at = now()
  where id = p_id;

  if v_key = 'smka' then
    insert into public.peribadahan_smka_kelompok (item_id, kelompok, pf_id, laki_laki, perempuan)
    select
      p_id,
      x ->> 'kelompok',
      case
        when x ->> 'kelompok' in ('guru_sekolah_minggu', 'orang_tua') then null
        else nullif(x ->> 'pf_id', '')::uuid
      end,
      (x ->> 'laki_laki')::int,
      (x ->> 'perempuan')::int
    from jsonb_array_elements(p_smka_kelompok) x
    on conflict (item_id, kelompok) do update
    set pf_id = excluded.pf_id, laki_laki = excluded.laki_laki, perempuan = excluded.perempuan;
  end if;
end;
$$;

-- Matches tema/dpa/catatan/bahan_alkitab case-insensitively. p_search is a
-- bound RPC parameter, never concatenated into a filter string, so commas
-- and parentheses in it can't inject extra conditions; the caller escapes
-- '%'/'_' first (lib/api-mutation.ts's escapeLike) so they match literally
-- instead of acting as ILIKE wildcards. SECURITY INVOKER: RLS already limits
-- this to signed-in users with warta:read, same as reading the table directly.
create or replace function public.search_peribadahan_item_ids(p_search text)
returns table (id uuid)
language sql
stable
security invoker
set search_path = ''
as $$
  select i.id
  from public.peribadahan_items i
  where coalesce(btrim(p_search), '') <> ''
    and (
      i.tema ilike '%' || p_search || '%'
      or i.dpa ilike '%' || p_search || '%'
      or i.catatan ilike '%' || p_search || '%'
      or i.bahan_alkitab ilike '%' || p_search || '%'
    )
$$;

revoke all on function public.update_peribadahan_item(
  uuid, time, uuid, uuid, uuid, uuid, uuid, text, text, text, int, int, int, text, jsonb
) from public, anon;
revoke all on function public.search_peribadahan_item_ids(text) from public, anon;

grant execute on function public.update_peribadahan_item(
  uuid, time, uuid, uuid, uuid, uuid, uuid, text, text, text, int, int, int, text, jsonb
) to authenticated;
grant execute on function public.search_peribadahan_item_ids(text) to authenticated;
