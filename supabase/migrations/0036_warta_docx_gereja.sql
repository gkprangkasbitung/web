-- Stage 12b: the Warta DOCX left column (brief §16.2).
--
-- The DOCX route requires `warta:read` (brief §16.3), but its left column
-- reads Profil Gereja, its rekening, the jadwal rutin, and the pastors, which
-- RLS opens only to `situs:read` (0029, 0031, 0035). Rather than widening
-- those policies, or reaching for the service-role key (brief §3 doesn't list
-- this use), this one function returns exactly the columns the warta prints,
-- after its own `warta:read` check, the same DEFINER pattern as
-- `sarana_dana_report` (0025).
--
-- Pastors: currently serving (tahun_selesai is null) with tampil_di_warta,
-- name and no_hp only. no_hp is printed in the warta by design (§16.2) but
-- still never reaches anon: this function isn't granted to anon, and
-- `public_pendeta()` (0031) doesn't carry the column.

create or replace function public.warta_docx_gereja()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_permission(auth.uid(), 'warta', 'read') then
    raise exception using errcode = '42501', message = 'Kamu tidak punya akses untuk tindakan ini.';
  end if;

  return jsonb_build_object(
    'profil', (
      select jsonb_build_object(
        'alamat', p.alamat,
        'telepon', p.telepon,
        'telepon_sekretariat', p.telepon_sekretariat,
        'email', p.email,
        'jam_sekretariat', p.jam_sekretariat,
        'website_url', p.website_url,
        'instagram_url', p.instagram_url,
        'youtube_url', p.youtube_url,
        'facebook_url', p.facebook_url
      )
      from public.profil_gereja p
      where p.id = 1
    ),
    'rekening', (
      select jsonb_build_object(
        'nama_bank', r.nama_bank,
        'nomor_rekening', r.nomor_rekening,
        'atas_nama', r.atas_nama
      )
      from public.profil_gereja_rekening r
      where r.id = 1
    ),
    'jadwal_rutin', coalesce((
      select jsonb_agg(
        jsonb_build_object('nama', j.nama, 'keterangan_waktu', j.keterangan_waktu)
        order by j.sort_order, j.created_at, j.id
      )
      from public.profil_gereja_jadwal_rutin j
    ), '[]'::jsonb),
    'pendeta', coalesce((
      select jsonb_agg(
        jsonb_build_object('nama', d.nama, 'no_hp', d.no_hp)
        order by d.tahun_mulai, d.nama, d.id
      )
      from public.pendeta d
      where d.tahun_selesai is null and d.tampil_di_warta
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.warta_docx_gereja() from public, anon;
grant execute on function public.warta_docx_gereja() to authenticated;
