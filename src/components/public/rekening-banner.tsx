import Image from "next/image";

import type { RekeningInfo } from "@/lib/public/site-content";

import { EyebrowHeading } from "./public-shell";

/**
 * Beranda's "Persembahan" band (docs/design/beranda.html), from Profil
 * Gereja's Persembahan section (brief §14.1). The caller hides it when no
 * account is set (§14.6).
 */
export function RekeningBanner({ rekening }: { rekening: RekeningInfo }) {
  return (
    <section
      aria-labelledby="persembahan"
      className="grid gap-10 rounded-3xl bg-brand px-6 py-10 text-brand-foreground md:px-12 md:py-14 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-center lg:gap-16 lg:px-20 lg:py-18"
    >
      <div className="flex flex-col gap-4.5">
        <EyebrowHeading id="persembahan" eyebrow="Persembahan" title="Mendukung pelayanan gereja" tone="brand" />
        <p className="text-base leading-relaxed text-brand-foreground/85 md:text-[17px]">
          Persembahan dan dukungan untuk pelayanan dapat disalurkan melalui rekening resmi gereja.
        </p>
      </div>
      <div className="flex flex-col gap-3.5 rounded-[18px] border border-brand-foreground/16 bg-brand-foreground/6 p-6 md:p-7">
        <span className="text-[13px] text-brand-muted">Rekening</span>
        <dl className="flex flex-col gap-3.5">
          <div className="flex flex-col">
            <dt className="sr-only">Bank dan nomor rekening</dt>
            <dd className="text-xl font-semibold tracking-[0.02em] wrap-break-word md:text-[22px]">
              {rekening.namaBank} · <span className="font-mono tabular-nums">{rekening.nomorRekening}</span>
            </dd>
          </div>
          <div className="flex flex-col">
            <dt className="sr-only">Atas nama</dt>
            <dd className="text-[15px] text-brand-foreground/85">a.n. {rekening.atasNama}</dd>
          </div>
        </dl>
        {rekening.qris && (
          <>
            <div className="h-px bg-brand-foreground/16" />
            <div className="flex items-center gap-4">
              <div className="relative size-32 shrink-0 overflow-hidden rounded-xl bg-white">
                <Image src={rekening.qris.url} alt={rekening.qris.alt} fill sizes="128px" className="object-contain p-2" />
              </div>
              <span className="text-sm text-brand-foreground/85">Pindai QRIS untuk memberi persembahan.</span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
