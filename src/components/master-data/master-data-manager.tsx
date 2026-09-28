"use client";

import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/data-table/data-table";
import { createDataTableColumnHelper } from "@/components/data-table/features";
import { useDataTable } from "@/components/data-table/use-data-table";
import { Button } from "@/components/ui/button";
import { apiFetch, errorMessage } from "@/lib/api-client";
import type { MasterDataConfig, MasterDataRow } from "@/lib/master-data";

import { MasterDataFormDialog, type MasterDataValues } from "./master-data-form-dialog";

const helper = createDataTableColumnHelper<MasterDataRow>();

function buildColumns(config: MasterDataConfig) {
  return helper.columns(
    config.fields.map((field) =>
      helper.accessor(field.name, {
        id: field.name,
        header: field.label,
        enableSorting: true,
        meta: { search: true, className: field.name === "nama" ? "font-medium" : undefined },
        cell: ({ getValue }) => getValue() || <span className="text-muted-foreground">—</span>,
      }),
    ),
  );
}

/** Tempat, Wilayah, and Label Jemaat (brief §9.8): table, add/edit dialog, delete with confirmation. */
export function MasterDataManager({
  config,
  rows,
  canWrite,
}: {
  config: MasterDataConfig;
  rows: MasterDataRow[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const columns = useMemo(() => buildColumns(config), [config]);
  const table = useDataTable({ data: rows, columns, getRowId: (row) => row.id });

  // The dialog keeps its row while closing so the title doesn't change mid-animation.
  const [dialogRow, setDialogRow] = useState<MasterDataRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  function openDialog(row: MasterDataRow | null) {
    setDialogRow(row);
    setDialogOpen(true);
  }

  async function save(values: MasterDataValues) {
    try {
      if (dialogRow) {
        await apiFetch(`${config.apiPath}/${dialogRow.id}`, { method: "PATCH", body: values });
        toast.success(`${config.entityLabel} diperbarui`);
      } else {
        await apiFetch(config.apiPath, { method: "POST", body: values });
        toast.success(`${config.entityLabel} ditambahkan`);
      }
      router.refresh();
    } catch (error) {
      const message = errorMessage(error);
      toast.error(message);
      throw new Error(message);
    }
  }

  async function remove(row: MasterDataRow) {
    try {
      await apiFetch(`${config.apiPath}/${row.id}`, { method: "DELETE" });
      toast.success(`${config.entityLabel} dihapus`);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  }

  const addButton = canWrite ? (
    <Button onClick={() => openDialog(null)}>
      <PlusIcon aria-hidden />
      {config.addLabel}
    </Button>
  ) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={config.title} description={config.description} actions={addButton} />

      <DataTable
        table={table}
        label={config.title}
        noun={config.noun}
        canWrite={canWrite}
        addAction={addButton}
        rowActions={{
          getRowLabel: (row) => row.nama,
          edit: { onSelect: (row) => openDialog(row) },
          delete: {
            title: (row) => `Hapus ${config.dialogNoun} "${row.nama}"?`,
            description: () => config.deleteConsequence,
            onConfirm: remove,
          },
        }}
      />

      <MasterDataFormDialog
        config={config}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        row={dialogRow}
        readOnly={!canWrite}
        onSubmit={save}
      />
    </div>
  );
}
