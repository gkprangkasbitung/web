import Image from "next/image";

import type { RekeningInfo } from "@/lib/public/site-content";

/**
 * Beranda's "Persembahan" band (docs/design/beranda.html), from Profil
 * Gereja's Persembahan section (brief §14.1). The caller hides it when no
 * account is set (§14.6).
 */
export function RekeningBanner({ rekening }: { rekening: RekeningInfo }) {
  return (
    <section
      aria-labelledby="persembahan"
      className="flex flex-col gap-6 rounded-2xl bg-brand p-8 text-brand-foreground md:flex-row md:items-center md:justify-between md:gap-8 md:p-10"
    >
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium tracking-[0.12em] text-brand-muted uppercase">Persembahan</span>
        <h2 id="persembahan" className="font-serif text-2xl font-normal md:text-3xl">
          Mendukung pelayanan gereja
        </h2>
        <p className="max-w-md text-sm text-brand-muted">
          Persembahan dan dukungan untuk pelayanan dapat disalurkan melalui rekening resmi gereja.
        </p>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <dl className="flex min-w-64 flex-col gap-2 rounded-xl border border-brand-border bg-brand-foreground/5 p-5">
          <dt className="text-xs text-brand-muted">Rekening {rekening.namaBank}</dt>
          <dd className="font-mono text-lg font-semibold tabular-nums">{rekening.nomorRekening}</dd>
          <dd className="text-sm text-brand-muted">a.n. {rekening.atasNama}</dd>
        </dl>
        {rekening.qris && (
          <div className="relative size-40 shrink-0 overflow-hidden rounded-xl bg-white p-2">
            <Image src={rekening.qris.url} alt={rekening.qris.alt} fill sizes="160px" className="object-contain p-2" />
          </div>
        )}
      </div>
    </section>
  );
}
