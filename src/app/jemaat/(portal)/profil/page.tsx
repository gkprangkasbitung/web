import type { Metadata } from "next";

import { PengajuanSection } from "@/components/jemaat-portal/pengajuan-section";
import { Badge } from "@/components/ui/badge";
import { requireJemaat } from "@/lib/auth/session";
import { formatDateShort } from "@/lib/dates";
import {
  JENIS_KELAMIN_LABELS,
  STATUS_KEANGGOTAAN_BADGE,
  STATUS_KEANGGOTAAN_LABELS,
  type JenisKelamin,
  type StatusKeanggotaan,
} from "@/lib/jemaat";
import { loadKeluargaSaya, loadPengajuanSaya, loadProfilSaya } from "@/lib/portal/data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Profil Saya" };

function statusLabel(value: string | null): string {
  if (!value) return "—";
  return STATUS_KEANGGOTAAN_LABELS[value as StatusKeanggotaan] ?? value;
}

function jenisKelaminLabel(value: string | null): string {
  if (!value) return "—";
  return JENIS_KELAMIN_LABELS[value as JenisKelamin] ?? value;
}

function Field({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-base" : "text-base font-medium"}>{value}</dd>
    </div>
  );
}

/**
 * Profil Saya (brief §17.3): data diri (read-only — the only way to change
 * it is the request below), anggota keluarga, then the change-request form.
 * Every field is read through `lib/portal` with the caller's own session.
 */
export default async function ProfilPage() {
  await requireJemaat();
  const supabase = await createClient();
  const [profil, keluarga, pengajuan] = await Promise.all([
    loadProfilSaya(supabase),
    loadKeluargaSaya(supabase),
    loadPengajuanSaya(supabase),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-1">
        <h1 className="font-serif text-3xl font-normal tracking-tight">Profil Saya</h1>
        <p className="text-sm text-muted-foreground">Data diri Anda yang tercatat di gereja.</p>
      </div>

      <section aria-labelledby="data-diri" className="flex flex-col gap-4">
        <h2 id="data-diri" className="font-serif text-xl font-normal">
          Data Diri
        </h2>
        {profil ? (
          <dl className="grid grid-cols-1 gap-5 rounded-xl border border-border bg-card p-5 sm:grid-cols-2">
            <Field label="Nama" value={profil.nama} />
            <Field label="No. Anggota" value={profil.nomorAnggota ?? "—"} mono />
            <Field label="Jenis Kelamin" value={jenisKelaminLabel(profil.jenisKelamin)} />
            <Field label="Status Keanggotaan" value={statusLabel(profil.statusKeanggotaan)} />
            <Field label="Wilayah" value={profil.wilayahNama ?? "—"} />
            <Field
              label="Keluarga"
              value={profil.keluargaNama ? `${profil.keluargaNama}${profil.hubunganKeluarga ? ` (${profil.hubunganKeluarga})` : ""}` : "—"}
            />
            <Field label="Tanggal Lahir" value={profil.tanggalLahir ? formatDateShort(profil.tanggalLahir) : "—"} />
            <Field label="Tanggal Masuk" value={profil.tanggalMasuk ? formatDateShort(profil.tanggalMasuk) : "—"} />
            <Field label="Pekerjaan" value={profil.pekerjaan ?? "—"} />
            <Field label="Alamat" value={profil.alamat ?? "—"} />
            <Field label="No. HP" value={profil.noHp ?? "—"} mono />
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">Data profil tidak ditemukan. Hubungi sekretariat.</p>
        )}
      </section>

      {keluarga.length > 0 && (
        <section aria-labelledby="anggota-keluarga" className="flex flex-col gap-4">
          <h2 id="anggota-keluarga" className="font-serif text-xl font-normal">
            Anggota Keluarga
          </h2>
          <ul className="flex flex-col gap-2">
            {keluarga.map((member, index) => (
              <li
                key={index}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3"
              >
                <div className="flex flex-col">
                  <span className="font-medium">{member.nama}</span>
                  {member.hubunganKeluarga && <span className="text-sm text-muted-foreground">{member.hubunganKeluarga}</span>}
                </div>
                <Badge variant={STATUS_KEANGGOTAAN_BADGE[member.statusKeanggotaan as StatusKeanggotaan] ?? "neutral"}>
                  {statusLabel(member.statusKeanggotaan)}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      )}

      <PengajuanSection profil={profil} latestPengajuan={pengajuan[0] ?? null} />
    </div>
  );
}
