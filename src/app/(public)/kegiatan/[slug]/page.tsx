import {
  CalendarIcon,
  ClockIcon,
  MapPinIcon,
  MessageCircleIcon,
  UsersRoundIcon,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { KategoriBadge } from '@/components/kegiatan/kategori-badge';
import { PublicImage } from '@/components/public/public-image';
import { KegiatanRelatedGrid } from '@/components/public/kegiatan-related-grid';
import {
  PublicContainer,
  PublicPageTitleBand,
  PublicSection,
} from '@/components/public/public-shell';
import {
  formatTanggalRangeLong,
  formatWaktuRange,
  isSepanjangHari,
} from '@/lib/kegiatan';
import {
  loadKegiatanDetailContent,
  loadKegiatanLainnya,
} from '@/lib/public/site-content';

type Props = { params: Promise<{ slug: string }> };

/** A draft or unknown slug 404s here too (brief §14.4). */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const kegiatan = await loadKegiatanDetailContent(slug);
  if (!kegiatan) notFound();
  return {
    title: kegiatan.judul,
    description: `${kegiatan.judul} — ${formatTanggalRangeLong(kegiatan.tanggalMulai, kegiatan.tanggalSelesai)}.`,
  };
}

/** `/kegiatan/[slug]` (brief §14.4), per docs/design/kegiatan-detail.html. */
export default async function KegiatanDetailPage({ params }: Props) {
  const { slug } = await params;
  const kegiatan = await loadKegiatanDetailContent(slug);
  if (!kegiatan) notFound();

  const related = await loadKegiatanLainnya(kegiatan.id);
  const allDay = isSepanjangHari(kegiatan.waktuMulai, kegiatan.waktuSelesai);

  return (
    <>
      <PublicPageTitleBand
        breadcrumb={
          <Link href="/kegiatan" className="hover:underline">
            ← Kembali ke kalender
          </Link>
        }
        eyebrow={
          <KategoriBadge
            nama={kegiatan.kategoriNama}
            warna={kegiatan.kategoriWarna}
          />
        }
        title={kegiatan.judul}
        description={formatTanggalRangeLong(
          kegiatan.tanggalMulai,
          kegiatan.tanggalSelesai,
        )}
      />

      <PublicContainer>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <article className="flex flex-col gap-7">
            <PublicImage
              photo={kegiatan.photo}
              ratio="video"
              fallbackLabel={`Foto kegiatan: ${kegiatan.judul}`}
            />

            <PublicSection id="tentang" title="Tentang kegiatan">
              {kegiatan.deskripsi ? (
                <p className="leading-relaxed whitespace-pre-line">
                  {kegiatan.deskripsi}
                </p>
              ) : (
                <p className="text-muted-foreground">
                  Belum ada deskripsi untuk kegiatan ini.
                </p>
              )}
            </PublicSection>

            {kegiatan.infoPendaftaran && (
              <div className="flex flex-col gap-2 rounded-2xl bg-muted/50 p-6">
                <span className="font-semibold">Pendaftaran</span>
                <p className="whitespace-pre-line text-muted-foreground">
                  {kegiatan.infoPendaftaran}
                </p>
              </div>
            )}
          </article>

          <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
            <div className="divide-y divide-border rounded-[18px] border border-border bg-card px-6">
              <InfoRow
                icon={CalendarIcon}
                label="Tanggal"
                value={formatTanggalRangeLong(
                  kegiatan.tanggalMulai,
                  kegiatan.tanggalSelesai,
                )}
              />
              <InfoRow
                icon={ClockIcon}
                label="Waktu"
                value={
                  allDay
                    ? 'Sepanjang hari'
                    : formatWaktuRange(
                        kegiatan.waktuMulai,
                        kegiatan.waktuSelesai,
                      )
                }
              />
              {kegiatan.tempat && (
                <InfoRow
                  icon={MapPinIcon}
                  label="Tempat"
                  value={kegiatan.tempat}
                  link={
                    kegiatan.mapsUrl
                      ? { href: kegiatan.mapsUrl, label: 'Buka peta' }
                      : undefined
                  }
                />
              )}
              {kegiatan.penyelenggaraKomisiNama && (
                <InfoRow
                  icon={UsersRoundIcon}
                  label="Penyelenggara"
                  value={kegiatan.penyelenggaraKomisiNama}
                  link={
                    kegiatan.penyelenggaraKomisiSlug
                      ? {
                          href: `/komisi/${kegiatan.penyelenggaraKomisiSlug}`,
                          label: 'Lihat komisi',
                        }
                      : undefined
                  }
                  linkExternal={false}
                />
              )}
            </div>

            {kegiatan.waShareHref && (
              <a
                href={kegiatan.waShareHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-13 items-center justify-center gap-2 rounded-full border border-foreground text-sm font-medium"
              >
                <MessageCircleIcon aria-hidden className="size-4.5" />
                Bagikan lewat WhatsApp
              </a>
            )}
          </aside>
        </div>

        {related.length > 0 && (
          <PublicSection id="lainnya" title="Kegiatan lainnya">
            <KegiatanRelatedGrid items={related} />
          </PublicSection>
        )}
      </PublicContainer>
    </>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
  link,
  linkExternal = true,
}: {
  icon: typeof CalendarIcon;
  label: string;
  value: string;
  link?: { href: string; label: string };
  linkExternal?: boolean;
}) {
  return (
    <div className="flex gap-3.5 py-4.5">
      <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
      <div className="flex flex-col gap-0.5">
        <span className="text-[13px] text-muted-foreground">{label}</span>
        <span className="font-medium">{value}</span>
        {link &&
          (linkExternal ? (
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-primary hover:underline"
            >
              {link.label}
            </a>
          ) : (
            <Link
              href={link.href}
              className="text-sm font-medium text-primary hover:underline"
            >
              {link.label}
            </Link>
          ))}
      </div>
    </div>
  );
}
