import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PublicContainer, PublicPageTitleBand, PublicSection } from "@/components/public/public-shell";
import { PublicImage } from "@/components/public/public-image";
import { loadKomisiDetailContent } from "@/lib/public/site-content";

type Props = { params: Promise<{ slug: string }> };

/** A hidden or unknown slug 404s here too (brief §14.8). */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const komisi = await loadKomisiDetailContent(slug);
  if (!komisi) notFound();
  return {
    title: komisi.nama,
    description: komisi.deskripsi?.trim() || `Komisi ${komisi.nama} di GKP Rangkasbitung.`,
  };
}

/** `/komisi/[slug]` (brief §14.8): deskripsi, periode, pembina, then anggota grouped by jabatan. */
export default async function KomisiDetailPage({ params }: Props) {
  const { slug } = await params;
  const komisi = await loadKomisiDetailContent(slug);
  if (!komisi) notFound();

  return (
    <>
      <PublicPageTitleBand
        breadcrumb={
          <Link href="/komisi" className="hover:underline">
            ← Semua komisi
          </Link>
        }
        eyebrow={komisi.periode ?? undefined}
        title={komisi.nama}
      />

      <PublicContainer narrow>
        {komisi.photo && <PublicImage photo={komisi.photo} ratio="video" fallbackLabel={`Foto ${komisi.nama}`} />}

        {komisi.deskripsi && <p className="leading-relaxed whitespace-pre-line">{komisi.deskripsi}</p>}

        {komisi.pembinaNama && (
          <p className="text-sm text-muted-foreground">
            Pembina: <span className="font-medium text-foreground">{komisi.pembinaNama}</span>
          </p>
        )}

        <PublicSection id="anggota" title="Anggota">
          {komisi.anggotaPerJabatan.length === 0 ? (
            <p className="text-muted-foreground">Belum ada anggota yang tercatat.</p>
          ) : (
            <div className="flex flex-col gap-6">
              {komisi.anggotaPerJabatan.map((group) => (
                <div key={group.jabatan} className="flex flex-col gap-2">
                  <h3 className="font-semibold">{group.jabatan}</h3>
                  <ul className="flex flex-col gap-1 text-muted-foreground">
                    {group.anggota.map((nama) => (
                      <li key={nama}>{nama}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </PublicSection>
      </PublicContainer>
    </>
  );
}
