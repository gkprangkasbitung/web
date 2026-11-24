"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";

import { FormError } from "@/components/auth/form-error";
import { PageHeader } from "@/components/admin/page-header";
import { PersonPicker } from "@/components/shared/person-picker";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PemilihanBantu, PemilihBantu } from "@/lib/pemilihan/admin-types";
import { formatJadwal } from "@/lib/pemilihan/tampilan";
import type { Kandidat, Kontes, PemilihanErrorReason } from "@/lib/pemilihan/types";

import { SuratSuara, type PilihanSuara } from "./surat-suara";

const MAKS_NOMOR = 50;

/**
 * `/admin/pemilihan/[id]/bantu` (brief §18.5): the panitia records a paper
 * ballot for a voter who hasn't voted (their own record is never listed).
 * Identity check and form number are required; the ballot is the shared
 * two-step one. After a success the form starts empty for the next voter;
 * choices are never stored in the browser.
 */
export function BantuMemilih({
  pemilihan,
  kontes,
  kandidat,
  pemilih,
}: {
  pemilihan: PemilihanBantu;
  kontes: Kontes[];
  kandidat: Kandidat[];
  pemilih: PemilihBantu[];
}) {
  const id = useId();
  const router = useRouter();
  const [jemaatId, setJemaatId] = useState<string | null>(null);
  const [verifikasi, setVerifikasi] = useState(false);
  const [nomor, setNomor] = useState("");
  const [nomorError, setNomorError] = useState<string | null>(null);
  const [ballotKey, setBallotKey] = useState(0);

  const terpilih = pemilih.find((p) => p.jemaatId === jemaatId) ?? null;
  const nomorBersih = nomor.trim();
  const alasan = !terpilih
    ? "Pilih pemilih dulu."
    : !verifikasi
      ? 'Centang "Identitas pemilih sudah diverifikasi" dulu.'
      : !nomorBersih
        ? "Isi nomor formulir dulu."
        : nomorBersih.length > MAKS_NOMOR
          ? `Nomor formulir maksimal ${MAKS_NOMOR} karakter.`
          : null;

  function reset() {
    setJemaatId(null);
    setVerifikasi(false);
    setNomor("");
    setNomorError(null);
    setBallotKey((k) => k + 1);
  }

  async function kirim(pilihan: PilihanSuara) {
    if (alasan || !terpilih) return;
    let response: Response;
    try {
      response = await fetch(`/api/admin/pemilihan/${pemilihan.id}/bantu`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jemaatId: terpilih.jemaatId, nomorFormulir: nomorBersih, penatua: pilihan.penatua, ppj: pilihan.ppj }),
      });
    } catch {
      toast.error("Tidak dapat terhubung ke server. Periksa koneksi internet, lalu coba lagi.");
      return;
    }
    const payload = (await response.json().catch(() => null)) as
      | { data?: { namaPemilih: string }; error?: string; reason?: PemilihanErrorReason }
      | null;

    if (response.ok && payload?.data) {
      toast.success(`Suara ${payload.data.namaPemilih} tercatat (formulir ${nomorBersih}).`);
      reset();
      router.refresh();
      return;
    }

    const reason = payload?.reason;
    if (reason === "formulir_terpakai") {
      // The choices stay; only the number needs checking.
      setNomorError(`Nomor formulir "${nomorBersih}" sudah dipakai pada pemilihan ini. Periksa lagi nomor pada formulir kertas.`);
      toast.error("Nomor formulir sudah dipakai.");
      return;
    }
    if (reason === "formulir_tidak_valid") {
      setNomorError(payload?.error ?? "Nomor formulir tidak valid.");
      return;
    }
    toast.error(payload?.error ?? "Terjadi kesalahan di server. Coba lagi.");
    if (reason === "sudah_memilih" || reason === "bukan_pemilih") {
      reset();
      router.refresh();
    }
  }

  const header = (
    <>
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link href={`/admin/pemilihan/${pemilihan.id}`} className="hover:underline">
          {pemilihan.nama}
        </Link>{" "}
        / Bantu Memilih
      </nav>
      <PageHeader
        title="Bantu Memilih"
        description={`${pemilihan.nama} · ${formatJadwal(pemilihan.dibukaPada, pemilihan.ditutupPada)}`}
      />
    </>
  );

  if (pemilihan.status !== "dibuka") {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Alert>
          <AlertTitle>{pemilihan.status === "draft" ? "Pemungutan suara belum dibuka" : "Pemungutan suara sudah ditutup"}</AlertTitle>
          <AlertDescription>Suara hanya bisa dicatat selama pemilihan dibuka.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {header}

      <Card>
        <CardHeader>
          <CardTitle>Pemilih</CardTitle>
          <CardDescription>
            Hanya pemilih yang belum memberikan suara. Data jemaat Anda sendiri tidak tercantum: silakan memilih lewat Portal Jemaat.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-pemilih`}>
              Nama pemilih <span aria-hidden className="text-muted-foreground">*</span>
            </Label>
            <PersonPicker
              id={`${id}-pemilih`}
              people={pemilih.map((p) => ({ id: p.jemaatId, nama: p.namaTampilan, labels: p.kelompokWilayah ? [p.kelompokWilayah] : [] }))}
              value={jemaatId}
              onValueChange={setJemaatId}
              placeholder="Cari nama pemilih..."
            />
            <p className="text-xs text-muted-foreground">{pemilih.length} pemilih belum memberikan suara.</p>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox id={`${id}-verifikasi`} checked={verifikasi} onCheckedChange={(checked) => setVerifikasi(checked === true)} />
            <Label htmlFor={`${id}-verifikasi`}>
              Identitas pemilih sudah diverifikasi <span aria-hidden className="text-muted-foreground">*</span>
            </Label>
          </div>

          <div className="flex flex-col gap-2 sm:max-w-xs">
            <Label htmlFor={`${id}-nomor`}>
              Nomor formulir <span aria-hidden className="text-muted-foreground">*</span>
            </Label>
            <Input
              id={`${id}-nomor`}
              value={nomor}
              onChange={(event) => {
                setNomor(event.target.value);
                setNomorError(null);
              }}
              maxLength={MAKS_NOMOR}
              autoComplete="off"
              aria-invalid={nomorError ? true : undefined}
              aria-describedby={nomorError ? `${id}-nomor-error` : undefined}
            />
            <FormError id={`${id}-nomor-error`} message={nomorError} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Surat Suara</CardTitle>
          <CardDescription>Isi sesuai formulir kertas pemilih.</CardDescription>
        </CardHeader>
        <CardContent>
          <SuratSuara
            key={ballotKey}
            kontes={kontes}
            kandidat={kandidat}
            onKirim={kirim}
            alasanTidakBisaKirim={alasan}
            deskripsiKonfirmasi={
              terpilih
                ? `Suara ${terpilih.namaTampilan} (formulir ${nomorBersih}) akan dicatat dan tidak bisa diubah atau dibatalkan.`
                : undefined
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
