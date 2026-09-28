"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch, errorMessage } from "@/lib/api-client";
import type { JemaatDetail, JemaatFormOptions } from "@/lib/jemaat-routes";
import { STATUS_KEANGGOTAAN_BADGE, STATUS_KEANGGOTAAN_LABELS, type StatusKeanggotaan } from "@/lib/jemaat";

import { CatatanPastoralSection, type CatatanPastoral } from "./catatan-pastoral-section";
import { JemaatProfileForm, type JemaatProfileValues } from "./jemaat-profile-form";

function StatusBadge({ status }: { status: StatusKeanggotaan | null }) {
  if (!status) return null;
  return <Badge variant={STATUS_KEANGGOTAAN_BADGE[status]}>{STATUS_KEANGGOTAAN_LABELS[status]}</Badge>;
}

function toValues(detail: JemaatDetail): JemaatProfileValues {
  return {
    nama: detail.nama,
    nomorAnggota: detail.nomorAnggota ?? "",
    jenisKelamin: detail.jenisKelamin,
    statusKeanggotaan: detail.statusKeanggotaan,
    wilayahId: detail.wilayahId,
    pekerjaan: detail.pekerjaan ?? "",
    alamat: detail.alamat ?? "",
    noHp: detail.noHp ?? "",
    tanggalLahir: detail.tanggalLahir,
    tanggalMasuk: detail.tanggalMasuk,
    keluargaNama: detail.keluargaNama ?? "",
    hubunganKeluarga: detail.hubunganKeluarga as JemaatProfileValues["hubunganKeluarga"],
    labelIds: detail.labelIds,
  };
}

function toProfilePayload(values: JemaatProfileValues) {
  return {
    nama: values.nama,
    nomorAnggota: values.nomorAnggota || null,
    jenisKelamin: values.jenisKelamin,
    statusKeanggotaan: values.statusKeanggotaan,
    wilayahId: values.wilayahId,
    pekerjaan: values.pekerjaan || null,
    alamat: values.alamat || null,
    noHp: values.noHp || null,
    tanggalLahir: values.tanggalLahir,
    tanggalMasuk: values.tanggalMasuk,
    keluargaNama: values.keluargaNama || null,
    hubunganKeluarga: values.hubunganKeluarga,
    labelIds: values.labelIds,
  };
}

export function JemaatDetailView({
  detail,
  catatan,
  options,
  labelsById,
  canWrite,
}: {
  detail: JemaatDetail;
  catatan: readonly CatatanPastoral[];
  options: JemaatFormOptions;
  labelsById: ReadonlyMap<string, string>;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState<JemaatProfileValues>(toValues(detail));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function submit() {
    if (!values.nama.trim()) {
      setError("Nama wajib diisi.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await apiFetch(`/api/admin/jemaat/${detail.id}`, { method: "PATCH", body: toProfilePayload(values) });
      toast.success("Perubahan disimpan");
      router.refresh();
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    try {
      await apiFetch(`/api/admin/jemaat/${detail.id}`, { method: "DELETE" });
      toast.success(`${detail.nama} dihapus`);
      router.push("/admin/jemaat");
      router.refresh();
    } catch (removeError) {
      toast.error(errorMessage(removeError));
      throw removeError;
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/jemaat" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
        ← Kembali ke daftar jemaat
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {detail.nomorAnggota && <span className="font-mono text-sm text-muted-foreground">{detail.nomorAnggota}</span>}
            <h1 className="text-2xl font-semibold tracking-tight">{detail.nama}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={detail.statusKeanggotaan} />
            {detail.wilayahNama && <Badge variant="outline">{detail.wilayahNama}</Badge>}
            {detail.keluargaId && (
              <Link href={`/admin/keluarga/${detail.keluargaId}`}>
                <Badge variant="accent">{detail.keluargaNama}</Badge>
              </Link>
            )}
            {detail.labelIds.map((id) => (
              <Badge key={id} variant="neutral">
                {labelsById.get(id) ?? id}
              </Badge>
            ))}
          </div>
        </div>

        {canWrite && (
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" onClick={() => setDeleteOpen(true)}>
              Hapus
            </Button>
            <Button form="jemaat-profil" type="submit" disabled={pending} focusableWhenDisabled>
              Simpan Perubahan
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profil</CardTitle>
        </CardHeader>
        <CardContent>
          <JemaatProfileForm
            formId="jemaat-profil"
            values={values}
            onValuesChange={setValues}
            wilayahOptions={options.wilayahOptions}
            keluargaSuggestions={options.keluargaOptions.map((k) => k.nama)}
            labelOptions={options.labelOptions}
            disabled={!canWrite || pending}
            onSubmit={submit}
            errorId="jemaat-profil-error"
          />
          {error && (
            <p id="jemaat-profil-error" role="alert" className="mt-4 text-sm text-destructive">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Anggota Keluarga</CardTitle>
        </CardHeader>
        <CardContent>
          {detail.anggotaKeluarga.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada anggota keluarga lain yang tercatat.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {detail.anggotaKeluarga.map((member) => (
                <li key={member.id} className="flex items-center justify-between gap-4 py-2">
                  <Link href={`/admin/jemaat/${member.id}`} className="font-medium hover:underline">
                    {member.nama}
                  </Link>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {member.hubunganKeluarga && <span>{member.hubunganKeluarga}</span>}
                    <StatusBadge status={member.statusKeanggotaan} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <CatatanPastoralSection jemaatId={detail.id} catatan={catatan} canWrite={canWrite} />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Hapus ${detail.nama}?`}
        description="Catatan pastoral milik jemaat ini akan ikut terhapus. Tindakan ini tidak bisa dibatalkan."
        onConfirm={remove}
      />
    </div>
  );
}
