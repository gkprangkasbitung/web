"use client";

import { ArrowLeftIcon, ArrowRightIcon, SearchIcon, SendIcon } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Kandidat, Kontes, KontesKode } from "@/lib/pemilihan/types";

export type PilihanSuara = Record<KontesKode, string[]>;

export type SuratSuaraProps = {
  /** The contests in ballot order, with their limits from pemilihan_kontes (never hardcoded). */
  kontes: readonly Kontes[];
  /** Candidates, already sorted by name. */
  kandidat: readonly Kandidat[];
  /**
   * Sends the ballot after the confirmation. Reject (after showing the
   * error) to keep the confirmation open and the choices as they are.
   */
  onKirim: (pilihan: PilihanSuara) => Promise<unknown>;
  /** Why the ballot can't be sent yet (shown at the review step), or null. */
  alasanTidakBisaKirim?: string | null;
  /** The confirmation's text. */
  deskripsiKonfirmasi?: React.ReactNode;
  disabled?: boolean;
};

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase("id")
    .trim();
}

function kosong(kontes: readonly Kontes[]): PilihanSuara {
  return Object.fromEntries(kontes.map((k) => [k.kode, []])) as unknown as PilihanSuara;
}

/**
 * The ballot (brief §18.3, §18.5), shared by the panitia's assisted voting
 * and the Portal Jemaat (14c): one step per contest (searchable
 * alphabetical list, sticky counter, inline warnings, further checkboxes
 * disabled at the maximum), a review step, then a confirmation that the
 * vote can't be changed. Choices live only in this component's state:
 * never in storage, never on the server before sending. Remount with a new
 * `key` to start a fresh ballot.
 */
export function SuratSuara({ kontes, kandidat, onKirim, alasanTidakBisaKirim = null, deskripsiKonfirmasi, disabled }: SuratSuaraProps) {
  const id = useId();
  const [langkah, setLangkah] = useState(0);
  const [pilihan, setPilihan] = useState<PilihanSuara>(() => kosong(kontes));
  const [cari, setCari] = useState("");
  const [konfirmasi, setKonfirmasi] = useState(false);

  const namaById = useMemo(() => new Map(kandidat.map((k) => [k.jemaatId, k.namaTampilan])), [kandidat]);
  const tinjau = langkah >= kontes.length;
  const aktif = tinjau ? null : kontes[langkah]!;

  const terpilih = aktif ? pilihan[aktif.kode] : [];
  const penuh = aktif ? terpilih.length >= aktif.maxPilih : false;
  const kurang = aktif ? terpilih.length < aktif.minPilih : false;
  const daftar = useMemo(() => {
    const q = normalize(cari);
    return q ? kandidat.filter((k) => normalize(k.namaTampilan).includes(q)) : kandidat;
  }, [kandidat, cari]);

  const semuaSah = kontes.every((k) => pilihan[k.kode].length >= k.minPilih && pilihan[k.kode].length <= k.maxPilih);

  function toggle(kode: KontesKode, jemaatId: string, checked: boolean, max: number) {
    setPilihan((current) => {
      const list = current[kode];
      if (checked) {
        if (list.includes(jemaatId) || list.length >= max) return current;
        return { ...current, [kode]: [...list, jemaatId] };
      }
      return { ...current, [kode]: list.filter((x) => x !== jemaatId) };
    });
  }

  function keLangkah(next: number) {
    setCari("");
    setLangkah(next);
  }

  if (tinjau) {
    return (
      <section className="flex flex-col gap-4" aria-labelledby={`${id}-tinjau`}>
        <h3 id={`${id}-tinjau`} className="text-base font-semibold">
          Tinjau pilihan
        </h3>
        {kontes.map((k, index) => (
          <div key={k.kode} className="flex flex-col gap-2 rounded-lg border p-4">
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-medium">
                {k.nama} <span className="text-sm font-normal text-muted-foreground">({pilihan[k.kode].length} dipilih)</span>
              </h4>
              <Button type="button" variant="outline" size="sm" onClick={() => keLangkah(index)} disabled={disabled}>
                Ubah
              </Button>
            </div>
            <ol className="list-decimal pl-5 text-sm sm:columns-2">
              {[...pilihan[k.kode]]
                .sort((a, b) => kandidat.findIndex((x) => x.jemaatId === a) - kandidat.findIndex((x) => x.jemaatId === b))
                .map((jemaatId) => (
                  <li key={jemaatId}>{namaById.get(jemaatId) ?? "?"}</li>
                ))}
            </ol>
          </div>
        ))}
        {alasanTidakBisaKirim && (
          <p role="alert" className="text-sm text-destructive">
            {alasanTidakBisaKirim}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button type="button" variant="outline" onClick={() => keLangkah(kontes.length - 1)} disabled={disabled}>
            <ArrowLeftIcon aria-hidden />
            Kembali
          </Button>
          <Button type="button" onClick={() => setKonfirmasi(true)} disabled={disabled || !semuaSah || alasanTidakBisaKirim !== null}>
            <SendIcon aria-hidden />
            Kirim Suara
          </Button>
        </div>
        <ConfirmDialog
          open={konfirmasi}
          onOpenChange={setKonfirmasi}
          title="Kirim suara sekarang?"
          description={deskripsiKonfirmasi ?? "Suara yang sudah dikirim tidak bisa diubah atau dibatalkan."}
          confirmLabel="Ya, kirim suara"
          onConfirm={() => onKirim(pilihan)}
        />
      </section>
    );
  }

  const k = aktif!;
  return (
    <section className="flex flex-col gap-3" aria-labelledby={`${id}-judul`}>
      <div className="flex flex-col gap-1">
        <p className="text-xs text-muted-foreground">
          Langkah {langkah + 1} dari {kontes.length + 1}
        </p>
        <h3 id={`${id}-judul`} className="text-base font-semibold">
          {k.nama}
        </h3>
        <p className="text-sm text-muted-foreground">
          Pilih minimal {k.minPilih} dan maksimal {k.maxPilih} calon.
        </p>
      </div>

      <div className="sticky top-0 z-10 flex flex-col gap-1 border-b bg-background py-2">
        <p className="text-sm font-medium tabular-nums" aria-live="polite">
          {terpilih.length} dari maks. {k.maxPilih} dipilih
        </p>
        {kurang && <p className="text-sm text-muted-foreground">Pilih minimal {k.minPilih} calon untuk lanjut.</p>}
        {penuh && <p className="text-sm text-amber-700 dark:text-amber-400">Batas maksimal {k.maxPilih} calon tercapai.</p>}
      </div>

      <div className="relative">
        <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label={`Cari calon ${k.nama}`}
          placeholder="Cari nama calon..."
          value={cari}
          onChange={(event) => setCari(event.target.value)}
          className="pl-8"
          disabled={disabled}
        />
      </div>

      <ul className="flex max-h-[28rem] flex-col overflow-y-auto rounded-lg border" aria-label={`Calon ${k.nama}`}>
        {daftar.length === 0 && <li className="p-3 text-sm text-muted-foreground">Tidak ada calon yang cocok.</li>}
        {daftar.map((calon) => {
          const checked = terpilih.includes(calon.jemaatId);
          const inputId = `${id}-${k.kode}-${calon.jemaatId}`;
          return (
            <li key={calon.jemaatId} className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0">
              <Checkbox
                id={inputId}
                checked={checked}
                onCheckedChange={(next) => toggle(k.kode, calon.jemaatId, next === true, k.maxPilih)}
                disabled={disabled || (!checked && penuh)}
              />
              <Label htmlFor={inputId} className="flex-1 cursor-pointer font-normal">
                {calon.namaTampilan}
              </Label>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button type="button" variant="outline" onClick={() => keLangkah(langkah - 1)} disabled={disabled || langkah === 0}>
          <ArrowLeftIcon aria-hidden />
          Kembali
        </Button>
        <Button type="button" onClick={() => keLangkah(langkah + 1)} disabled={disabled || kurang || terpilih.length > k.maxPilih}>
          {langkah === kontes.length - 1 ? "Tinjau" : "Lanjut"}
          <ArrowRightIcon aria-hidden />
        </Button>
      </div>
    </section>
  );
}
