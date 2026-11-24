"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

const subscribe = () => () => {};

/**
 * A copy of `children` rendered into <body>, invisible on screen, so the
 * print stylesheet in globals.css (`.dokumen-cetak`) prints only it, black
 * on white whatever the theme. The same approach as the password slips
 * (stage 14d). Used by the Pemilihan berita acara.
 */
export function DokumenCetak({ children }: { children: React.ReactNode }) {
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  if (!mounted) return null;
  return createPortal(
    <div className="dokumen-cetak hidden bg-white text-black" aria-hidden="true">
      {children}
    </div>,
    document.body,
  );
}
