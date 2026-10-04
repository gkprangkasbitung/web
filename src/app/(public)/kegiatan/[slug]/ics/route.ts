import { NextResponse } from "next/server";

import { buildKegiatanIcs } from "@/lib/public/ics";
import { loadKegiatanDetailContent } from "@/lib/public/site-content";
import { siteOrigin } from "@/lib/site-url";

type RouteContext = { params: Promise<{ slug: string }> };

/**
 * `GET /kegiatan/[slug]/ics` (brief §14.4, D): a single-event .ics download,
 * published rows only (`kegiatan_detail` already excludes drafts). The
 * event's URL inside the file always uses the configured `SITE_URL`, never
 * this request's Host header; without it configured, the route fails
 * closed with a 500 rather than guess a domain.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  const { slug } = await params;
  const kegiatan = await loadKegiatanDetailContent(slug);
  if (!kegiatan) return new NextResponse("Kegiatan tidak ditemukan.", { status: 404 });

  const origin = siteOrigin();
  if (!origin) {
    console.error("[kegiatan ics] SITE_URL is missing or invalid; can't build an absolute URL for the .ics file.");
    return new NextResponse("Terjadi kesalahan di server. Coba lagi.", { status: 500 });
  }

  const ics = buildKegiatanIcs({
    id: kegiatan.id,
    judul: kegiatan.judul,
    tanggalMulai: kegiatan.tanggalMulai,
    tanggalSelesai: kegiatan.tanggalSelesai,
    waktuMulai: kegiatan.waktuMulai,
    waktuSelesai: kegiatan.waktuSelesai,
    tempat: kegiatan.tempat,
    deskripsi: kegiatan.deskripsi,
    origin,
    slug: kegiatan.slug,
  });

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${kegiatan.slug}.ics"`,
    },
  });
}
