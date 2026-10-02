"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { DataTable } from "@/components/data-table/data-table";
import { createDataTableColumnHelper } from "@/components/data-table/features";
import { useDataTable } from "@/components/data-table/use-data-table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { STATUS_KEANGGOTAAN_BADGE, STATUS_KEANGGOTAAN_LABELS } from "@/lib/jemaat";
import type { JabatanKomisiRow, KomisiAnggotaRow, KomisiDetail } from "@/lib/komisi";
import type { KomisiPersonOption } from "@/lib/komisi-routes";
import { situsPhotoUrl } from "@/lib/situs-photo";

import { InlineJabatanCell } from "./inline-jabatan-cell";
import { KomisiDialog } from "./komisi-dialog";
import { TambahAnggotaForm } from "./tambah-anggota-form";

const helper = createDataTableColumnHelper<KomisiAnggotaRow>();

export function KomisiDetailView({
  komisi,
  jabatanOptions,
  pembinaOptions,
  anggotaOptions,
  canWrite,
  canDelete,
  canManageAnggota,
}: {
  komisi: KomisiDetail;
  jabatanOptions: readonly JabatanKomisiRow[];
  pembinaOptions: readonly KomisiPersonOption[];
  anggotaOptions: readonly KomisiPersonOption[];
  /** situs:update: editing the komisi itself (nama, deskripsi, foto, pembina, tampil). */
  canWrite: boolean;
  /** situs:delete. */
  canDelete: boolean;
  /** situs:update AND warta:read (brief §14.8): add/edit/remove members. */
  canManageAnggota: boolean;
}) {
  const router = useRouter();

  const columns = [
    helper.accessor("nama", {
      header: "Nama",
      enableSorting: true,
      meta: { search: true, className: "font-medium" },
      cell: ({ row }) => (
        <Link href={`/admin/jemaat/${row.original.jemaatId}`} className="hover:underline">
          {row.original.nama}
        </Link>
      ),
    }),
    helper.accessor("jabatanNama", {
      id: "jabatanNama",
      header: "Jabatan",
      cell: ({ row }) =>
        canManageAnggota ? (
          <InlineJabatanCell
            komisiId={komisi.id}
            jemaatId={row.original.jemaatId}
            value={row.original.jabatanId}
            jabatanOptions={jabatanOptions}
            onSaved={() => router.refresh()}
          />
        ) : (
          row.original.jabatanNama
        ),
    }),
    helper.accessor("statusKeanggotaan", {
      header: "Status Jemaat",
      cell: ({ row }) => {
        const status = row.original.statusKeanggotaan;
        return (
          <div className="flex flex-wrap items-center gap-2">
            {status ? (
              <Badge variant={STATUS_KEANGGOTAAN_BADGE[status]}>{STATUS_KEANGGOTAAN_LABELS[status]}</Badge>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
            {!row.original.eligible && <Badge variant="destructive">Tidak memenuhi syarat</Badge>}
          </div>
        );
      },
    }),
  ];

  const table = useDataTable({ data: komisi.anggota, columns, getRowId: (row) => row.jemaatId });

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function removeKomisi() {
    try {
      await apiFetch(`/api/admin/komisi/${komisi.id}`, { method: "DELETE" });
      toast.success(`Komisi ${komisi.nama} dihapus`);
      router.push("/admin/komisi");
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  }

  async function removeAnggota(row: KomisiAnggotaRow) {
    try {
      await apiFetch(`/api/admin/komisi/${komisi.id}/anggota/${row.jemaatId}`, { method: "DELETE" });
      toast.success(`${row.nama} dihapus dari komisi`);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  }

  const deleteConsequence =
    komisi.anggota.length === 0
      ? "Tindakan ini tidak bisa dibatalkan."
      : `${komisi.anggota.length} anggota yang tercatat di komisi ini akan ikut terlepas. Tindakan ini tidak bisa dibatalkan.`;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/komisi" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
        ← Kembali ke daftar komisi
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          {komisi.foto_path && komisi.foto_alt ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={situsPhotoUrl(komisi.foto_path)} alt={komisi.foto_alt} className="size-16 rounded-xl object-cover" />
          ) : (
            <InitialsAvatar name={komisi.nama} className="size-16 text-lg" />
          )}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{komisi.nama}</h1>
              {!komisi.tampil && <Badge variant="neutral">Disembunyikan</Badge>}
            </div>
            {komisi.periode && <p className="text-sm text-muted-foreground">{komisi.periode}</p>}
            {komisi.pembinaNama && <p className="text-sm text-muted-foreground">Pembina: {komisi.pembinaNama}</p>}
          </div>
        </div>
        {canWrite && (
          <div className="flex shrink-0 gap-2">
            {canDelete && (
              <Button variant="outline" onClick={() => setDeleteOpen(true)}>
                Hapus
              </Button>
            )}
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              Edit
            </Button>
          </div>
        )}
      </div>

      {komisi.deskripsi && <p className="max-w-2xl text-muted-foreground whitespace-pre-line">{komisi.deskripsi}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Anggota</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <DataTable
            table={table}
            label="Anggota Komisi"
            noun="anggota"
            canWrite={canManageAnggota}
            rowActions={{
              getRowLabel: (row) => row.nama,
              delete: {
                title: (row) => `Hapus ${row.nama} dari komisi ini?`,
                onConfirm: removeAnggota,
              },
            }}
          />

          {canManageAnggota && (
            <div className="border-t border-border pt-6">
              <TambahAnggotaForm
                komisiId={komisi.id}
                anggotaOptions={anggotaOptions}
                jabatanOptions={jabatanOptions}
                memberIds={komisi.anggota.map((member) => member.jemaatId)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <KomisiDialog
        key={editOpen ? "editing" : "closed"}
        row={{
          id: komisi.id,
          nama: komisi.nama,
          slug: komisi.slug,
          deskripsi: komisi.deskripsi,
          periode: komisi.periode,
          foto_path: komisi.foto_path,
          foto_alt: komisi.foto_alt,
          pembinaJemaatId: komisi.pembinaJemaatId,
          pembinaNama: komisi.pembinaNama,
          tampil: komisi.tampil,
          sortOrder: 0,
          jumlahAnggota: komisi.anggota.length,
        }}
        pembinaOptions={pembinaOptions}
        open={editOpen}
        onOpenChange={setEditOpen}
        readOnly={!canWrite}
        onSaved={() => router.refresh()}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Hapus komisi "${komisi.nama}"?`}
        description={deleteConsequence}
        onConfirm={removeKomisi}
      />
    </div>
  );
}
