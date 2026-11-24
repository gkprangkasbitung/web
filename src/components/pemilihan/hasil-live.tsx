"use client";

import { DownloadIcon, FileTextIcon, HandHelpingIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/admin/page-header";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { downloadCsv } from "@/lib/csv";
import { formatTimeWibSeconds } from "@/lib/dates";
import { hasilKeCsv } from "@/lib/pemilihan/ekspor";
import { formatPersen, slugFile } from "@/lib/pemilihan/tampilan";
import type { Kontes } from "@/lib/pemilihan/types";
import type { HasilLive as HasilLiveData } from "@/lib/pemilihan/admin-types";

import { PemilihanStatusBadge } from "./pemilihan-status-badge";
import { TabelPeringkat } from "./tabel-peringkat";

export const POLL_MS = 10_000;

/**
 * Calls `tick` every `intervalMs` while the tab is visible: it stops when
 * the tab is hidden and, when it becomes visible again, refreshes at once
 * and resumes. `enabled` false stops it altogether.
 */
export function useVisiblePolling(tick: () => void, intervalMs: number, enabled: boolean) {
  const tickRef = useRef(tick);
  useEffect(() => {
    tickRef.current = tick;
  }, [tick]);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer === null) timer = setInterval(() => tickRef.current(), intervalMs);
    };
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") stop();
      else {
        tickRef.current();
        start();
      }
    };
    if (document.visibilityState !== "hidden") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, enabled]);
}

function Angka({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border p-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

/**
 * `/admin/pemilihan/[id]/hasil` (brief §18.4): turnout for pemilihan:read,
 * and the two rankings for pemilihan_hasil:read whatever the Portal Jemaat
 * switch says, refreshed every 10 s while the election may still change.
 * Never shows who voted together with what they chose.
 */
export function HasilLive({
  pemilihan,
  kontes,
  initial,
  canUpdate,
  canBantu,
}: {
  pemilihan: { id: string; nama: string };
  kontes: Kontes[];
  initial: HasilLiveData;
  canUpdate: boolean;
  canBantu: boolean;
}) {
  const toggleId = useId();
  const [data, setData] = useState(initial);
  const [gagal, setGagal] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/pemilihan/${pemilihan.id}/hasil`, { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      const payload = (await response.json()) as { data: HasilLiveData };
      setData(payload.data);
      setGagal(false);
    } catch {
      setGagal(true);
    }
  }, [pemilihan.id]);

  // Turnout and tallies change only while draft (the voter count) or dibuka.
  const berjalan = data.status === "draft" || data.status === "dibuka";
  useVisiblePolling(refresh, POLL_MS, berjalan);

  const selesai = data.status === "ditutup" || data.status === "diumumkan";
  const { partisipasi, suara } = data;

  async function ubahToggle() {
    try {
      await apiFetch(`/api/admin/pemilihan/${pemilihan.id}/tampilkan-hasil`, { method: "PATCH", body: { aktif: !data.tampilkanHasil } });
      toast.success(data.tampilkanHasil ? "Hasil sementara disembunyikan dari Portal Jemaat" : "Hasil sementara tampil di Portal Jemaat");
      await refresh();
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  }

  const actions = (
    <>
      {data.status === "dibuka" && canBantu && (
        <Link href={`/admin/pemilihan/${pemilihan.id}/bantu`} className={buttonVariants({ variant: "outline" })}>
          <HandHelpingIcon aria-hidden />
          Bantu Memilih
        </Link>
      )}
      {selesai && suara && (
        <>
          <Button variant="outline" onClick={() => downloadCsv(`hasil-${slugFile(pemilihan.nama)}.csv`, hasilKeCsv(suara))}>
            <DownloadIcon aria-hidden />
            Ekspor CSV
          </Button>
          <Link href={`/admin/pemilihan/${pemilihan.id}/berita-acara`} className={buttonVariants({ variant: "outline" })}>
            <FileTextIcon aria-hidden />
            Berita Acara
          </Link>
        </>
      )}
    </>
  );

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link href="/admin/pemilihan" className="hover:underline">
          Pemilihan
        </Link>{" "}
        /{" "}
        <Link href={`/admin/pemilihan/${pemilihan.id}`} className="hover:underline">
          {pemilihan.nama}
        </Link>{" "}
        / Hasil
      </nav>
      <PageHeader title={`Hasil: ${pemilihan.nama}`} actions={actions} />

      <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
        <PemilihanStatusBadge status={data.status} />
        <span>Diperbarui pukul {formatTimeWibSeconds(data.waktu)}</span>
        {berjalan && <span>· diperbarui otomatis tiap 10 detik selama tab ini terlihat</span>}
        {gagal && <span className="text-destructive">· gagal memperbarui, mencoba lagi</span>}
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Partisipasi</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Angka label="Sudah memilih" value={`${partisipasi.sudahMemilih} / ${partisipasi.totalPemilih}`} sub="dari seluruh pemilih" />
            <Angka label="Persentase" value={formatPersen(partisipasi.persen)} />
            <Angka label="Mandiri (Portal Jemaat)" value={String(partisipasi.mandiri)} />
            <Angka label="Dibantu panitia" value={String(partisipasi.dibantu)} />
          </div>
          {partisipasi.dibantuPerPanitia.length > 0 && (
            <div className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Suara dibantu per panitia</span>
              <ul>
                {partisipasi.dibantuPerPanitia.map((p) => (
                  <li key={p.userId}>
                    {p.nama ?? "(akun sudah dihapus)"}: <span className="tabular-nums">{p.jumlah}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {canUpdate && (
        <Card>
          <CardHeader>
            <CardTitle>Portal Jemaat</CardTitle>
            <CardDescription>
              Hasil selalu tampil di Portal Jemaat setelah diumumkan. Sebelum itu, hasil sementara hanya tampil kalau pengaturan ini
              dinyalakan.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Checkbox id={toggleId} checked={data.tampilkanHasil} onCheckedChange={() => setConfirmOpen(true)} />
              <Label htmlFor={toggleId}>Tampilkan hasil sementara di Portal Jemaat</Label>
            </div>
          </CardContent>
        </Card>
      )}

      {suara ? (
        <Card>
          <CardHeader>
            <CardTitle>Perolehan Suara</CardTitle>
            <CardDescription>Hanya jumlah suara per calon. Tidak ada data siapa memilih siapa.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {kontes.map((k) => (
              <TabelPeringkat key={k.kode} judul={k.nama} hasil={suara.filter((row) => row.kontes === k.kode)} />
            ))}
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">Perolehan suara hanya bisa dilihat oleh pemegang izin pemilihan_hasil:read.</p>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={data.tampilkanHasil ? "Sembunyikan hasil sementara dari Portal Jemaat?" : "Tampilkan hasil sementara di Portal Jemaat?"}
        description={
          data.tampilkanHasil
            ? "Jemaat tidak lagi melihat hasil di Portal Jemaat sampai hasil diumumkan."
            : "Semua jemaat yang punya akun portal akan melihat jumlah suara saat ini. Selama pemungutan berjalan, hasil sementara bisa membuka pilihan seseorang (misalnya saat baru satu suara masuk). Disarankan tetap mati sampai pemilihan ditutup."
        }
        confirmLabel={data.tampilkanHasil ? "Sembunyikan" : "Tampilkan"}
        onConfirm={ubahToggle}
      />
    </div>
  );
}
