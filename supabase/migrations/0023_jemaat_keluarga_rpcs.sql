-- Data Jemaat + Keluarga (brief §9.9-9.10): case-insensitive family names
-- enforced in the database, at most one Kepala Keluarga per family, and two
-- RPCs so the multi-step writes are atomic (brief §12.6).

-- keluarga.nama is already unique (case-sensitive, 0017). This additionally
-- rejects two names that differ only by case, so save_jemaat's find-or-create
-- can't race into a duplicate.
create unique index keluarga_nama_lower_idx on public.keluarga (lower(nama));

-- At most one "Kepala Keluarga" per family (approved 2026-09-28; the brief
-- doesn't set this rule, so it's enforced here rather than left unbounded).
-- A jemaat with no family (keluarga_id null) never matches this partial
-- index, since NULL is never equal to NULL in a unique index.
create unique index jemaat_satu_kepala_keluarga on public.jemaat (keluarga_id) where hubungan_keluarga = 'Kepala Keluarga';

-- Saves a jemaat's profile, resolves its family by name, and replaces its
-- labels, all in one transaction (brief §9.9). p_id null creates a new
-- jemaat. The family name is matched case-insensitively; an unmatched name
-- creates the family, and a blank name clears the link (and the hubungan
-- with it, since a hubungan without a family is meaningless).
--
-- Every message this function raises is safe to show as-is: the route
-- handler forwards it directly instead of using the generic dbError mapping
-- (see lib/api-mutation.ts, rpcError).
create or replace function public.save_jemaat(
  p_nama text,
  p_id uuid default null,
  p_nomor_anggota text default null,
  p_jenis_kelamin text default null,
  p_status_keanggotaan text default null,
  p_wilayah_id uuid default null,
  p_pekerjaan text default null,
  p_alamat text default null,
  p_no_hp text default null,
  p_tanggal_lahir date default null,
  p_tanggal_masuk date default null,
  p_keluarga_nama text default null,
  p_hubungan_keluarga text default null,
  p_label_ids uuid[] default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_keluarga_nama text := nullif(btrim(p_keluarga_nama), '');
  v_keluarga_id uuid;
  v_hubungan text := p_hubungan_keluarga;
  v_constraint text;
begin
  if not public.has_permission(auth.uid(), 'warta', 'update') then
    raise exception using errcode = '42501', message = 'Kamu tidak punya akses untuk tindakan ini.';
  end if;
  if coalesce(btrim(p_nama), '') = '' then
    raise exception using errcode = '22023', message = 'Nama wajib diisi.';
  end if;
  if p_id is not null and not exists (select 1 from public.jemaat where id = p_id) then
    raise exception using errcode = 'P0002', message = 'Jemaat tidak ditemukan.';
  end if;
  if p_wilayah_id is not null and not exists (select 1 from public.wilayah where id = p_wilayah_id) then
    raise exception using errcode = '23503', message = 'Wilayah tidak ditemukan.';
  end if;

  if v_keluarga_nama is null then
    v_keluarga_id := null;
    v_hubungan := null;
  else
    select id into v_keluarga_id from public.keluarga where lower(nama) = lower(v_keluarga_nama);
    if v_keluarga_id is null then
      begin
        insert into public.keluarga (nama) values (v_keluarga_nama) returning id into v_keluarga_id;
      exception when unique_violation then
        -- Lost a race with another request creating the same family; reuse theirs.
        select id into v_keluarga_id from public.keluarga where lower(nama) = lower(v_keluarga_nama);
      end;
    end if;
  end if;

  if v_hubungan = 'Kepala Keluarga' and v_keluarga_id is not null and exists (
    select 1 from public.jemaat
    where keluarga_id = v_keluarga_id and hubungan_keluarga = 'Kepala Keluarga' and id is distinct from p_id
  ) then
    raise exception using errcode = '23505', message = 'Keluarga ini sudah punya Kepala Keluarga.';
  end if;

  if p_nomor_anggota is not null and exists (
    select 1 from public.jemaat where nomor_anggota = p_nomor_anggota and id is distinct from p_id
  ) then
    raise exception using errcode = '23505', message = 'Nomor anggota sudah digunakan.';
  end if;

  begin
    if p_id is null then
      insert into public.jemaat (
        nama, nomor_anggota, jenis_kelamin, status_keanggotaan, wilayah_id, pekerjaan, alamat, no_hp,
        tanggal_lahir, tanggal_masuk, keluarga_id, hubungan_keluarga
      ) values (
        btrim(p_nama), p_nomor_anggota, p_jenis_kelamin, p_status_keanggotaan, p_wilayah_id, p_pekerjaan, p_alamat,
        p_no_hp, p_tanggal_lahir, p_tanggal_masuk, v_keluarga_id, v_hubungan
      )
      returning id into v_id;
    else
      update public.jemaat set
        nama = btrim(p_nama),
        nomor_anggota = p_nomor_anggota,
        jenis_kelamin = p_jenis_kelamin,
        status_keanggotaan = p_status_keanggotaan,
        wilayah_id = p_wilayah_id,
        pekerjaan = p_pekerjaan,
        alamat = p_alamat,
        no_hp = p_no_hp,
        tanggal_lahir = p_tanggal_lahir,
        tanggal_masuk = p_tanggal_masuk,
        keluarga_id = v_keluarga_id,
        hubungan_keluarga = v_hubungan
      where id = p_id
      returning id into v_id;
    end if;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'jemaat_satu_kepala_keluarga' then
      raise exception using errcode = '23505', message = 'Keluarga ini sudah punya Kepala Keluarga.';
    else
      raise exception using errcode = '23505', message = 'Nomor anggota sudah digunakan.';
    end if;
  end;

  perform public.replace_jemaat_labels(v_id, p_label_ids);

  return v_id;
end;
$$;

-- Sets or clears a jemaat's family and hubungan together (brief §9.10):
-- "Tambah Anggota" (both set), the inline hubungan edit (same family, new
-- hubungan), and "Keluarkan" (both null). Moving someone out of another
-- family is allowed (approved 2026-09-28); the confirmation warning about it
-- is a client-side concern.
create or replace function public.set_jemaat_keluarga(
  p_jemaat_id uuid,
  p_keluarga_id uuid default null,
  p_hubungan_keluarga text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_hubungan text := case when p_keluarga_id is null then null else p_hubungan_keluarga end;
begin
  if not public.has_permission(auth.uid(), 'warta', 'update') then
    raise exception using errcode = '42501', message = 'Kamu tidak punya akses untuk tindakan ini.';
  end if;
  if not exists (select 1 from public.jemaat where id = p_jemaat_id) then
    raise exception using errcode = 'P0002', message = 'Jemaat tidak ditemukan.';
  end if;
  if p_keluarga_id is not null and not exists (select 1 from public.keluarga where id = p_keluarga_id) then
    raise exception using errcode = 'P0002', message = 'Keluarga tidak ditemukan.';
  end if;

  if v_hubungan = 'Kepala Keluarga' and exists (
    select 1 from public.jemaat
    where keluarga_id = p_keluarga_id and hubungan_keluarga = 'Kepala Keluarga' and id <> p_jemaat_id
  ) then
    raise exception using errcode = '23505', message = 'Keluarga ini sudah punya Kepala Keluarga.';
  end if;

  begin
    update public.jemaat
    set keluarga_id = p_keluarga_id,
        hubungan_keluarga = v_hubungan
    where id = p_jemaat_id;
  exception when unique_violation then
    raise exception using errcode = '23505', message = 'Keluarga ini sudah punya Kepala Keluarga.';
  end;
end;
$$;

revoke all on function public.save_jemaat(
  text, uuid, text, text, text, uuid, text, text, text, date, date, text, text, uuid[]
) from public, anon;
revoke all on function public.set_jemaat_keluarga(uuid, uuid, text) from public, anon;

grant execute on function public.save_jemaat(
  text, uuid, text, text, text, uuid, text, text, text, date, date, text, text, uuid[]
) to authenticated;
grant execute on function public.set_jemaat_keluarga(uuid, uuid, text) to authenticated;
