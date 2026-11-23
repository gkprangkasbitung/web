"use client";

import { PrinterIcon } from "lucide-react";
import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/** One account's login details, as the server returned them once (brief §18.7). */
export type SlipAccount = { nama: string; username: string; password: string; disesuaikan?: boolean };

const subscribe = () => () => {};

/** The site's origin, for the "Masuk di …" line; empty during SSR. */
function useOrigin(): string {
  return useSyncExternalStore(
    subscribe,
    () => window.location.origin,
    () => "",
  );
}

/**
 * The on-screen table of new login details: name, username, temporary
 * password. Shown once; nothing here is stored anywhere.
 */
export function PasswordTable({ accounts }: { accounts: readonly SlipAccount[] }) {
  return (
    <div className="max-h-[50vh] overflow-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-card text-left text-muted-foreground">
          <tr className="border-b border-border">
            <th scope="col" className="px-3 py-2 font-medium">
              Nama
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Username
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Password sementara
            </th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((account) => (
            <tr key={account.username} className="border-b border-border last:border-0">
              <td className="px-3 py-2">{account.nama}</td>
              <td className="px-3 py-2">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono">{account.username}</span>
                  {account.disesuaikan && <Badge variant="neutral">disesuaikan</Badge>}
                </span>
              </td>
              <td className="px-3 py-2 font-mono tracking-wide">{account.password}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The printable slips (one per account, two per row on A4, dashed cut
 * lines), rendered into <body> so the print stylesheet in globals.css can
 * hide everything else. Invisible on screen.
 */
function PrintableSlips({ accounts }: { accounts: readonly SlipAccount[] }) {
  const origin = useOrigin();
  if (!origin) return null;
  return createPortal(
    <div className="slip-cetak hidden bg-white text-black" aria-hidden="true">
      <div className="grid grid-cols-2 gap-4">
        {accounts.map((account) => (
          <section
            key={account.username}
            className="flex break-inside-avoid flex-col gap-3 rounded-lg border border-dashed border-black p-5 text-[11pt] leading-snug"
          >
            <div>
              <p className="text-[9pt] tracking-[0.1em] uppercase">Portal Jemaat</p>
              <p className="text-[13pt] font-semibold">GKP Rangkasbitung</p>
            </div>
            <dl className="flex flex-col gap-2">
              <div>
                <dt className="text-[9pt]">Nama</dt>
                <dd className="font-medium">{account.nama}</dd>
              </div>
              <div>
                <dt className="text-[9pt]">Username</dt>
                <dd className="font-mono text-[14pt] font-semibold">{account.username}</dd>
              </div>
              <div>
                <dt className="text-[9pt]">Password sementara</dt>
                <dd className="font-mono text-[14pt] font-semibold tracking-[0.08em]">{account.password}</dd>
              </div>
            </dl>
            <p className="text-[9.5pt]">
              Masuk di <span className="font-mono">{origin}/portal/masuk</span>. Saat pertama masuk, Anda akan diminta
              membuat password baru. Simpan slip ini sampai password diganti, lalu musnahkan.
            </p>
          </section>
        ))}
      </div>
    </div>,
    document.body,
  );
}

/** "Cetak Slip": the browser's print dialog, showing only the slips. */
export function PrintSlipsButton({ accounts }: { accounts: readonly SlipAccount[] }) {
  return (
    <>
      <Button type="button" onClick={() => window.print()}>
        <PrinterIcon aria-hidden />
        Cetak Slip
      </Button>
      <PrintableSlips accounts={accounts} />
    </>
  );
}

export const SHOWN_ONCE =
  "Password sementara hanya ditampilkan sekali dan tidak disimpan. Cetak slipnya sekarang; kalau terlewat, password harus direset.";
