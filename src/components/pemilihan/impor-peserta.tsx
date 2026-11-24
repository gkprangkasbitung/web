"use client";

import { FileSpreadsheetIcon, Loader2Icon, TriangleAlertIcon, UploadIcon } from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";

import { FormError } from "@/components/auth/form-error";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { IMPOR_FILE } from "@/lib/pemilihan/admin-types";
import { beresSaatImpor, LABEL_KATEGORI, type BarisImpor, type PratinjauImpor } from "@/lib/pemilihan/impor";

import { RingkasanLembar } from "./ringkasan-lembar";

const KATEGORI_PERHATIAN = ["error", "ambigu", "tidak_ditemukan"] as const;

/**
 * Import the peserta list (brief §18.4): one XLSX with several sheets
 * and/or several files at once. "Baca file" previews (nothing is saved);
 * "Simpan impor" replaces the whole list atomically. Unresolved rows are
 * then settled one by one in the table below.
 */
export function ImporPeserta({
  pemilihanId,
  adaDaftar,
  onSaved,
}: {
  pemilihanId: string;
  /** A list exists already: saving replaces it, so ask first. */
  adaDaftar: boolean;
  onSaved: () => void;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pratinjau, setPratinjau] = useState<PratinjauImpor | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function pick(list: FileList | null) {
    const chosen = Array.from(list ?? []);
    setPratinjau(null);
    setError(null);
    if (chosen.length > IMPOR_FILE.maxFiles) {
      setFiles([]);
      return void setError(`Maksimal ${IMPOR_FILE.maxFiles} file sekali impor.`);
    }
    const bad = chosen.find((file) => !/\.xlsx$/i.test(file.name));
    if (bad) {
      setFiles([]);
      return void setError(`"${bad.name}" bukan file .xlsx. Simpan sebagai Excel Workbook (.xlsx).`);
    }
    const big = chosen.find((file) => file.size > IMPOR_FILE.maxBytes);
    if (big) {
      setFiles([]);
      return void setError(`"${big.name}" lebih dari 1 MB.`);
    }
    setFiles(chosen);
  }

  async function baca() {
    if (files.length === 0) return void setError("Pilih minimal satu file .xlsx.");
    const form = new FormData();
    for (const file of files) form.append("file", file);
    setReading(true);
    setError(null);
    try {
      setPratinjau(await apiFetch<PratinjauImpor>(`/api/admin/pemilihan/${pemilihanId}/impor/pratinjau`, { method: "POST", body: form }));
    } catch (readError) {
      setError(errorMessage(readError));
    } finally {
      setReading(false);
    }
  }

  async function simpan() {
    if (!pratinjau) return;
    setSaving(true);
    try {
      const jumlahLembar = pratinjau.lembar.filter((l) => !l.dilewati).length;
      const result = await apiFetch<{ jumlahBaris: number; jumlahBeres: number }>(`/api/admin/pemilihan/${pemilihanId}/impor`, {
        method: "POST",
        body: { baris: pratinjau.baris, jumlahLembar: Math.max(1, jumlahLembar) },
      });
      const belum = result.jumlahBaris - result.jumlahBeres;
      toast.success(
        belum > 0 ? `${result.jumlahBaris} baris diimpor. ${belum} baris perlu diselesaikan.` : `${result.jumlahBaris} baris diimpor, semuanya beres.`,
      );
      setPratinjau(null);
      setFiles([]);
      if (inputRef.current) inputRef.current.value = "";
      onSaved();
    } catch (saveError) {
      toast.error(errorMessage(saveError));
      throw saveError;
    } finally {
      setSaving(false);
    }
  }

  const perhatian = pratinjau ? pratinjau.baris.filter((row) => row.kategori !== "cocok" || !beresSaatImpor(row)) : [];
  const dilewati = pratinjau?.lembar.filter((l) => l.dilewati) ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Impor Peserta</CardTitle>
        <CardDescription>
          File Excel (.xlsx) dengan kolom No, Nama, Dapat Memilih, Dapat Dipilih, Tidak Dapat Dipilih, Usia (&lt;25 / &gt;65),
          Domisili (boleh tidak ada), dan Keterangan. Boleh satu file berisi beberapa sheet, atau beberapa file sekaligus (satu per
          wilayah). Maksimal {IMPOR_FILE.maxFiles} file, masing-masing 1 MB.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-file`}>File peserta</Label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              ref={inputRef}
              id={`${id}-file`}
              type="file"
              multiple
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => pick(event.target.files)}
              disabled={reading || saving}
              className="text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium"
            />
            <Button type="button" variant="outline" onClick={baca} disabled={reading || saving || files.length === 0}>
              {reading ? <Loader2Icon aria-hidden className="motion-safe:animate-spin" /> : <FileSpreadsheetIcon aria-hidden />}
              Baca file
            </Button>
          </div>
          <FormError id={`${id}-error`} message={error} />
        </div>

        {pratinjau && (
          <div className="flex flex-col gap-4" aria-live="polite">
            <h3 className="text-base font-semibold">Pratinjau (belum disimpan)</h3>
            {dilewati.length > 0 && (
              <Alert>
                <TriangleAlertIcon aria-hidden="true" />
                <AlertTitle>Ada sheet yang tidak dibaca</AlertTitle>
                <AlertDescription>
                  {dilewati.map((l) => (
                    <span key={l.sumber} className="block">
                      {l.sumber}: {l.dilewati}
                    </span>
                  ))}
                </AlertDescription>
              </Alert>
            )}
            <RingkasanLembar
              caption="Pratinjau impor per sheet"
              rows={pratinjau.baris.map((row) => ({ ...row, beres: row.kategori !== "error" && beresSaatImpor(row) }))}
            />
            {perhatian.length > 0 && <BarisPerhatian rows={perhatian} />}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Menyimpan akan mengganti seluruh daftar peserta pemilihan ini. Baris yang belum beres bisa diselesaikan setelah
                disimpan; pemilihan baru bisa dibuka setelah semua beres.
              </p>
              <Button type="button" onClick={() => (adaDaftar ? setConfirmOpen(true) : simpan().catch(() => {}))} disabled={saving}>
                {saving ? <Loader2Icon aria-hidden className="motion-safe:animate-spin" /> : <UploadIcon aria-hidden />}
                Simpan impor
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Ganti daftar peserta?"
        description="Daftar peserta dan hasil impor sebelumnya, termasuk jemaat yang sudah dipilih untuk baris ambigu, akan diganti seluruhnya dengan isi file ini."
        confirmLabel="Ganti daftar"
        onConfirm={simpan}
      />
    </Card>
  );
}

/** The preview's rows that need the panitia, grouped. */
function BarisPerhatian({ rows }: { rows: readonly BarisImpor[] }) {
  const groups = [
    ...KATEGORI_PERHATIAN.map((k) => ({ key: k, label: LABEL_KATEGORI[k], rows: rows.filter((r) => r.kategori === k) })),
    { key: "konfirmasi", label: "Perlu konfirmasi", rows: rows.filter((r) => r.kategori === "cocok") },
  ].filter((g) => g.rows.length > 0);

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <details key={group.key} className="rounded-lg border p-3" open={group.key === "error"}>
          <summary className="cursor-pointer text-sm font-medium">
            {group.label} <Badge variant={group.key === "error" ? "destructive" : "neutral"}>{group.rows.length}</Badge>
          </summary>
          <ul className="mt-2 flex flex-col gap-2 text-sm">
            {group.rows.map((row) => (
              <li key={`${row.sumber}:${row.baris}`}>
                <span className="font-medium">{row.nama}</span>{" "}
                <span className="text-muted-foreground">
                  ({row.kelompokWilayah}, baris {row.baris})
                </span>
                {row.catatan.map((c) => (
                  <span key={c} className="block text-muted-foreground">
                    {c}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}
