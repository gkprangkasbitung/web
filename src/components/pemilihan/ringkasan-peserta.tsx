"use client";

import { KeyRoundIcon, UserPlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { DataTable } from "@/components/data-table/data-table";
import { createDataTableColumnHelper, type DataTableColumnDef } from "@/components/data-table/features";
import { useDataTable } from "@/components/data-table/use-data-table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResetPasswordResultDialog } from "@/components/users/reset-password-dialog";
import type { SlipAccount } from "@/components/users/password-slips";
import { CreateUsernameAccountsDialog, type CreateAccountsOutcome } from "@/components/users/username-account-dialog";
import { apiFetch, apiFetchWithWarning, errorMessage } from "@/lib/api-client";
import type { PesertaRow } from "@/lib/pemilihan/admin-types";
import type { CreateAccountsResult, ResetPasswordResult } from "@/lib/username-accounts-routes";

type Row = PesertaRow & { memilihLabel: string; dipilihLabel: string; akunLabel: string };

const helper = createDataTableColumnHelper<Row>();

function buildColumns(): DataTableColumnDef<Row>[] {
  return [
    helper.accessor("namaTampilan", { header: "Nama", enableSorting: true, meta: { search: true, className: "font-medium" } }),
    helper.accessor((row) => row.kelompokWilayah ?? "", {
      id: "kelompok",
      header: "Kelompok",
      meta: { facet: { title: "Kelompok", emptyLabel: "Tanpa kelompok" } },
    }),
    helper.accessor("memilihLabel", { header: "Memilih", meta: { facet: { title: "Memilih" } } }),
    helper.accessor("dipilihLabel", { header: "Dipilih", meta: { facet: { title: "Dipilih" } } }),
    helper.accessor((row) => row.alasanTidakDapatDipilih ?? "", {
      id: "alasan",
      header: "Alasan tidak dapat dipilih",
      meta: { search: true },
      cell: ({ getValue }) => getValue() || <span className="text-muted-foreground">—</span>,
    }),
    helper.accessor((row) => row.keterangan ?? "", {
      id: "keterangan",
      header: "Keterangan",
      cell: ({ getValue }) => getValue() || <span className="text-muted-foreground">—</span>,
    }),
    helper.accessor("akunLabel", {
      header: "Akun Portal",
      meta: { facet: { title: "Akun Portal" } },
      cell: ({ row }) => (row.original.punyaAkun ? (row.original.username ?? "Ada") : <span className="text-muted-foreground">Belum ada</span>),
    }),
  ];
}

function Angka({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border p-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      {note && <span className="text-xs text-muted-foreground">{note}</span>}
    </div>
  );
}

/**
 * Ringkasan peserta (brief §18.4): how many may vote, may be chosen, may not
 * be chosen (with the reasons), and may vote without a Portal Jemaat
 * account, with "Buat akun username" (§18.7) and the printable slips. Shown
 * to the panitia only; reasons and keterangan never reach the portal.
 */
export function RingkasanPeserta({
  peserta,
  canManageAccounts,
}: {
  peserta: PesertaRow[];
  /** pemilihan:update while the election is draft or dibuka: create accounts and reset passwords. */
  canManageAccounts: boolean;
}) {
  const router = useRouter();
  const data = useMemo<Row[]>(
    () =>
      peserta.map((p) => ({
        ...p,
        memilihLabel: p.dapatMemilih ? "Dapat memilih" : "Tidak dapat memilih",
        dipilihLabel: p.dapatDipilih ? "Dapat dipilih" : "Tidak dapat dipilih",
        akunLabel: p.punyaAkun ? "Punya akun" : "Belum ada akun",
      })),
    [peserta],
  );
  const columns = useMemo(() => buildColumns(), []);
  const table = useDataTable({ data, columns, getRowId: (row) => row.jemaatId });

  const memilih = peserta.filter((p) => p.dapatMemilih);
  const tanpaAkun = memilih.filter((p) => !p.punyaAkun);
  const tidakDipilih = peserta.filter((p) => !p.dapatDipilih);
  const alasan = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const p of tidakDipilih) {
      const key = p.alasanTidakDapatDipilih ?? "Tanpa alasan tertulis";
      map.set(key, [...(map.get(key) ?? []), p.namaTampilan]);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "id"));
  }, [tidakDipilih]);

  const [createOpen, setCreateOpen] = useState(false);
  const [createKey, setCreateKey] = useState(0);
  const [resetTarget, setResetTarget] = useState<PesertaRow | null>(null);
  const [resetResult, setResetResult] = useState<SlipAccount | null>(null);

  async function createAccounts(items: { jemaatId: string; username: string }[]): Promise<CreateAccountsOutcome> {
    const { data: result, warning } = await apiFetchWithWarning<CreateAccountsResult>("/api/admin/users/username", {
      method: "POST",
      body: { items },
    }).catch((error: unknown) => {
      throw new Error(errorMessage(error));
    });
    if (warning) toast.warning(warning, { duration: 10_000 });
    else toast.success(result.created.length === 1 ? "Akun username dibuat" : `${result.created.length} akun username dibuat`);
    router.refresh();
    return { ...result, warning };
  }

  async function resetPassword(row: PesertaRow) {
    if (!row.akunJemaatId) return;
    try {
      const result = await apiFetch<ResetPasswordResult>(`/api/admin/users/${row.akunJemaatId}/reset-password`, { method: "POST" });
      toast.success("Password direset");
      setResetResult({ nama: result.nama, username: result.username ?? row.username ?? "", password: result.password });
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ringkasan Peserta</CardTitle>
        <CardDescription>Alasan dan keterangan hanya untuk panitia, tidak tampil di Portal Jemaat.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Angka label="Dapat memilih" value={memilih.length} />
          <Angka label="Dapat dipilih" value={peserta.length - tidakDipilih.length} />
          <Angka label="Tidak dapat dipilih" value={tidakDipilih.length} />
          <Angka label="Dapat memilih, belum punya akun portal" value={tanpaAkun.length} note="Tetap bisa memilih lewat panitia (bantu memilih)." />
        </div>

        {alasan.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Alasan tidak dapat dipilih</h3>
            <ul className="flex flex-col gap-2 text-sm">
              {alasan.map(([teks, nama]) => (
                <li key={teks}>
                  <details>
                    <summary className="cursor-pointer">
                      {teks} <span className="text-muted-foreground">({nama.length})</span>
                    </summary>
                    <span className="mt-1 block text-muted-foreground">{nama.join(", ")}</span>
                  </details>
                </li>
              ))}
            </ul>
          </div>
        )}

        {canManageAccounts && tanpaAkun.length > 0 && (
          <div className="flex flex-col gap-2 rounded-lg border border-dashed p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm">
              {tanpaAkun.length} pemilih belum punya akun Portal Jemaat. Buatkan akun username, lalu cetak slip berisi password
              sementara untuk dibagikan.
            </p>
            <Button
              type="button"
              onClick={() => {
                setCreateKey((k) => k + 1);
                setCreateOpen(true);
              }}
            >
              <UserPlusIcon aria-hidden />
              Buat akun username
            </Button>
          </div>
        )}

        <DataTable
          table={table}
          label="Peserta pemilihan"
          noun="peserta"
          canWrite={canManageAccounts}
          rowActions={{
            getRowLabel: (row) => row.namaTampilan,
            extra: [
              {
                label: "Reset Password",
                icon: KeyRoundIcon,
                onSelect: (row) => setResetTarget(row),
                write: true,
                hidden: (row) => !row.akunJemaatId,
              },
            ],
          }}
        />
      </CardContent>

      <CreateUsernameAccountsDialog
        key={`create-${createKey}`}
        open={createOpen}
        onOpenChange={setCreateOpen}
        people={tanpaAkun.map((p) => ({ id: p.jemaatId, nama: p.namaTampilan, labels: p.kelompokWilayah ? [p.kelompokWilayah] : [] }))}
        // The panitia can't list other accounts' usernames; a clash is
        // adjusted by the server (2, 3, …) and marked on the slip.
        takenUsernames={new Set()}
        onSubmit={createAccounts}
      />

      <ConfirmDialog
        open={resetTarget !== null}
        onOpenChange={(next) => !next && setResetTarget(null)}
        title={`Reset password akun ${resetTarget?.username ?? resetTarget?.namaTampilan ?? ""}?`}
        description="Password lama tidak bisa dipakai lagi dan akun ini dikeluarkan dari semua perangkat. Password sementara yang baru hanya ditampilkan sekali, dan wajib diganti saat masuk."
        confirmLabel="Reset Password"
        onConfirm={() => (resetTarget ? resetPassword(resetTarget) : undefined)}
      />
      <ResetPasswordResultDialog account={resetResult} onClose={() => setResetResult(null)} />
    </Card>
  );
}
