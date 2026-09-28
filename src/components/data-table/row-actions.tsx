"use client";

import { cn } from "cn";
import { EllipsisIcon, EyeIcon, PencilIcon, Trash2Icon, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type RowAction<TData> = {
  label: string;
  icon?: LucideIcon;
  /** Either navigate… */
  href?: (row: TData) => string;
  /** …or run a handler (open a dialog, etc.). */
  onSelect?: (row: TData) => void;
  /** Needs `warta:update`; hidden in read-only mode. */
  write?: boolean;
};

export type RowActionsConfig<TData> = {
  /** Names the row in aria labels, e.g. the jemaat's name. */
  getRowLabel: (row: TData) => string;
  /** "Edit", or "Lihat" in read-only mode. */
  edit?: Pick<RowAction<TData>, "href" | "onSelect">;
  /** Module-specific actions, listed after Edit. */
  extra?: readonly RowAction<TData>[];
  /** "Hapus", behind a confirmation dialog. Hidden in read-only mode. */
  delete?: {
    /** Dialog title naming the record, e.g. `Hapus tempat "${row.nama}"?`. */
    title: (row: TData) => string;
    /** The consequence; defaults to "Tindakan ini tidak bisa dibatalkan." */
    description?: (row: TData) => React.ReactNode;
    /** Resolve to close the dialog; reject (after showing a toast) to keep it open. */
    onConfirm: (row: TData) => Promise<unknown> | unknown;
    /** Rows that may not be deleted, such as your own account. */
    hidden?: (row: TData) => boolean;
  };
};

export type ResolvedRowAction = {
  key: string;
  label: string;
  icon?: LucideIcon;
  href?: string;
  onSelect?: () => void;
};

/** The actions one row shows, after applying read-only mode. */
export function resolveRowActions<TData>(
  config: RowActionsConfig<TData>,
  row: TData,
  canWrite: boolean,
  onDelete: (row: TData) => void,
): { items: ResolvedRowAction[]; deleteItem: ResolvedRowAction | null } {
  const items: ResolvedRowAction[] = [];
  const edit = config.edit;
  if (edit) {
    items.push({
      key: "edit",
      label: canWrite ? "Edit" : "Lihat",
      icon: canWrite ? PencilIcon : EyeIcon,
      href: edit.href?.(row),
      onSelect: edit.onSelect && (() => edit.onSelect?.(row)),
    });
  }
  (config.extra ?? []).forEach((action, index) => {
    if (action.write && !canWrite) return;
    items.push({
      key: `extra-${index}`,
      label: action.label,
      icon: action.icon,
      href: action.href?.(row),
      onSelect: action.onSelect && (() => action.onSelect?.(row)),
    });
  });
  const deleteItem =
    canWrite && config.delete && !config.delete.hidden?.(row)
      ? { key: "delete", label: "Hapus", icon: Trash2Icon, onSelect: () => onDelete(row) }
      : null;
  return { items, deleteItem };
}

/**
 * The "⋯" menu at the end of a row. With a fine pointer that can hover, it
 * stays hidden until the row is hovered or focused; on touch it is always
 * visible (brief §9.2).
 */
export function RowActionsMenu({
  label,
  items,
  deleteItem,
}: {
  label: string;
  items: ResolvedRowAction[];
  deleteItem: ResolvedRowAction | null;
}) {
  if (items.length === 0 && !deleteItem) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Aksi untuk ${label}`}
            className={cn(
              "[@media(hover:hover)_and_(pointer:fine)]:opacity-0",
              "group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100",
            )}
          />
        }
      >
        <EllipsisIcon aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {items.map((item) => (
          <ActionItem key={item.key} item={item} />
        ))}
        {deleteItem && (
          <>
            {items.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem variant="destructive" onClick={deleteItem.onSelect}>
              <Trash2Icon aria-hidden />
              {deleteItem.label}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ActionItem({ item }: { item: ResolvedRowAction }) {
  const Icon = item.icon;
  const content = (
    <>
      {Icon && <Icon aria-hidden />}
      {item.label}
    </>
  );
  if (item.href) {
    return <DropdownMenuLinkItem render={<Link href={item.href} />}>{content}</DropdownMenuLinkItem>;
  }
  return <DropdownMenuItem onClick={item.onSelect}>{content}</DropdownMenuItem>;
}
