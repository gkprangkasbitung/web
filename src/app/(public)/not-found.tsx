import Link from "next/link";

import { PublicContainer, PublicPageHeader } from "@/components/public/public-shell";

/** `notFound()` on a public page, for example a draft or unknown warta (brief §8). */
export default function PublicNotFound() {
  return (
    <PublicContainer narrow>
      <PublicPageHeader
        title="Halaman tidak ditemukan"
        description="Halaman yang kamu cari tidak ada atau belum diterbitkan."
      />
      <div className="flex flex-wrap gap-4 text-sm font-medium">
        <Link href="/warta" className="text-primary underline-offset-4 hover:underline">
          Lihat semua warta
        </Link>
        <Link href="/" className="text-primary underline-offset-4 hover:underline">
          Kembali ke Beranda
        </Link>
      </div>
    </PublicContainer>
  );
}
