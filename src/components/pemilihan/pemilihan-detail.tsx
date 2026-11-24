"use client";

import { BarChart3Icon, FileTextIcon, HandHelpingIcon, LockIcon, MegaphoneIcon, PencilIcon, PlayIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { PageHeader } from "@/components/admin/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTimestamp } from "@/lib/dates";
import type { BarisImporRow, JemaatPilihan, Pencatat, PemilihanRow, PesertaRow, StatusAksi } from "@/lib/pemilihan/admin-types";
import { alasanBelumBisaDibuka, formatJadwal, formatPartisipasi } from "@/lib/pemilihan/tampilan";

import { BarisImporTable } from "./baris-impor-table";
import { ImporPeserta } from "./impor-peserta";
import { PemilihanDialog } from "./pemilihan-dialog";
import { PemilihanStatusBadge } from "./pemilihan-status-badge";
import { RingkasanPeserta } from "./ringkasan-peserta";
import { RingkasanLembar } from "./ringkasan-lembar";
import { StatusConfirmDialog } from "./status-confirm-dialog";

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function dicatat(waktu: string | null, oleh: string | null) {
  if (!waktu) return "—";
  return `${formatTimestamp(waktu)}${oleh ? ` oleh ${oleh}` : ""}`;
}

/** `/admin/pemilihan/[id]` (brief §18.4): the election, its import and peserta, and the status actions. */
export function PemilihanDetail({
  row,
  pencatat,
  baris,
  peserta,
  jemaat,
  canUpdate,
  canHasil,
  canBantu,
}: {
  row: PemilihanRow;
  pencatat: Pencatat;
  baris: BarisImporRow[];
  peserta: PesertaRow[];
  /** Data Jemaat for the import's picker; empty without pemilihan:update. */
  jemaat: JemaatPilihan[];
  canUpdate: boolean;
  canHasil: boolean;
  canBantu: boolean;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [aksi, setAksi] = useState<StatusAksi | null>(null);
  const [aksiOpen, setAksiOpen] = useState(false);

  const draft = row.status === "draft";
  const alasanBelumBuka = alasanBelumBisaDibuka(row);

  function openAksi(next: StatusAksi) {
    setAksi(next);
    setAksiOpen(true);
  }

  const actions = (
    <>
      {draft && canUpdate && (
        <Button variant="outline" onClick={() => setEditOpen(true)}>
          <PencilIcon aria-hidden />
          Ubah
        </Button>
      )}
      {!draft && (
        <Link href={`/admin/pemilihan/${row.id}/hasil`} className={buttonVariants({ variant: "outline" })}>
          <BarChart3Icon aria-hidden />
          Hasil
        </Link>
      )}
      {row.status === "dibuka" && canBantu && (
        <Link href={`/admin/pemilihan/${row.id}/bantu`} className={buttonVariants({ variant: "outline" })}>
          <HandHelpingIcon aria-hidden />
          Bantu Memilih
        </Link>
      )}
      {(row.status === "ditutup" || row.status === "diumumkan") && canHasil && (
        <Link href={`/admin/pemilihan/${row.id}/berita-acara`} className={buttonVariants({ variant: "outline" })}>
          <FileTextIcon aria-hidden />
          Berita Acara
        </Link>
      )}
      {canUpdate && draft && (
        <Button onClick={() => openAksi("buka")} disabled={alasanBelumBuka !== null} title={alasanBelumBuka ?? undefined}>
          <PlayIcon aria-hidden />
          Buka Pemilihan
        </Button>
      )}
      {canUpdate && row.status === "dibuka" && (
        <Button onClick={() => openAksi("tutup")}>
          <LockIcon aria-hidden />
          Tutup Pemilihan
        </Button>
      )}
      {canUpdate && row.status === "ditutup" && (
        <Button onClick={() => openAksi("umumkan")}>
          <MegaphoneIcon aria-hidden />
          Umumkan Hasil
        </Button>
      )}
    </>
  );

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link href="/admin/pemilihan" className="hover:underline">
          Pemilihan
        </Link>{" "}
        / {row.nama}
      </nav>
      <PageHeader title={row.nama} description={row.periode ? `Periode ${row.periode}` : undefined} actions={actions} />

      {draft && canUpdate && alasanBelumBuka && (
        <Alert>
          <AlertTitle>Belum bisa dibuka</AlertTitle>
          <AlertDescription>{alasanBelumBuka}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Status <PemilihanStatusBadge status={row.status} />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Info label="Jadwal (WIB)">{formatJadwal(row.dibukaPada, row.ditutupPada)}</Info>
            <Info label="Partisipasi">{formatPartisipasi(row.sudahMemilih, row.totalPemilih, row.persen)}</Info>
            <Info label="Tampilkan hasil sementara di Portal Jemaat">{row.tampilkanHasil ? "Ya" : "Tidak"}</Info>
            <Info label="Dibuat oleh">{pencatat.dibuatOleh ?? "—"}</Info>
            <Info label="Dibuka">{dicatat(row.waktuDibuka, pencatat.dibukaOleh)}</Info>
            <Info label="Ditutup">{dicatat(row.waktuDitutup, pencatat.ditutupOleh)}</Info>
            <Info label="Diumumkan">{dicatat(row.waktuDiumumkan, pencatat.diumumkanOleh)}</Info>
          </dl>
        </CardContent>
      </Card>

      {draft && canUpdate && <ImporPeserta pemilihanId={row.id} adaDaftar={baris.length > 0 || peserta.length > 0} onSaved={() => router.refresh()} />}

      {baris.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Hasil Impor</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <RingkasanLembar caption="Hasil impor per sheet" rows={baris} />
            {/* Resolving rows needs Data Jemaat, which only the panitia who may change the list loads. */}
            {draft && canUpdate && <BarisImporTable pemilihanId={row.id} rows={baris} jemaat={jemaat} canWrite />}
          </CardContent>
        </Card>
      )}

      <RingkasanPeserta peserta={peserta} canManageAccounts={canUpdate && (draft || row.status === "dibuka")} />

      {draft && canUpdate && (
        <PemilihanDialog key={`${row.id}-${editOpen}`} row={row} open={editOpen} onOpenChange={setEditOpen} onSaved={() => router.refresh()} />
      )}
      {aksi && (
        <StatusConfirmDialog row={row} aksi={aksi} open={aksiOpen} onOpenChange={setAksiOpen} onDone={() => router.refresh()} />
      )}
    </div>
  );
}
