/** Brief §9.6: the Deskripsi textarea's placeholder, with its two example bullets. */
export const LITBANG_DESKRIPSI_PLACEHOLDER =
  "Tulis deskripsi bebas, mis.\n" +
  "• Katekisasi Dasar setiap Sabtu di Ruang Konsistori pkl. 17.00 WIB\n" +
  "• Katekisasi Lanjutan setiap Jumat di Ruang Konsistori pkl. 17.00 WIB";

export type LitbangCardRow = {
  id: string;
  name: string;
  deskripsi: string | null;
  active: boolean;
  sort_order: number;
};
