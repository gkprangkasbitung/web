import type { RekeningInfo } from "@/lib/public/site-content";

/** Beranda's "Persembahan" CTA band (docs/design/beranda.html). Placeholder until stage 14.1. */
export function RekeningBanner({ rekening }: { rekening: RekeningInfo | null }) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-brand p-8 text-brand-foreground md:flex-row md:items-center md:justify-between md:gap-8 md:p-10">
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium tracking-[0.12em] text-brand-muted uppercase">Persembahan</span>
        <p className="font-serif text-2xl md:text-3xl">Mendukung pelayanan gereja</p>
        <p className="max-w-md text-sm text-brand-muted">
          Persembahan dan dukungan untuk pelayanan dapat disalurkan melalui rekening resmi gereja.
        </p>
      </div>
      <div className="flex min-w-64 flex-col gap-2 rounded-xl border border-brand-border bg-brand-foreground/5 p-5">
        <span className="text-xs text-brand-muted">Rekening</span>
        {rekening ? (
          <>
            <span className="text-lg font-semibold">
              {rekening.namaBank} · {rekening.nomorRekening}
            </span>
            <span className="text-sm text-brand-muted">a.n. {rekening.atasNama}</span>
          </>
        ) : (
          <span className="text-sm text-brand-muted">TODO: nama bank, nomor rekening, dan atas nama.</span>
        )}
      </div>
    </div>
  );
}
