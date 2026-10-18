import "server-only";

import { z } from "zod";

import {
  financeWeek,
  formatDateShort,
  formatDayDateShort,
  formatDayMonthShort,
  formatDayName,
  serviceWeek,
  type DateRange,
} from "@/lib/dates";
import { formatAmount, formatPhone } from "@/lib/format";
import { formatJam, layoutFor, SMKA_GROUPS, SMKA_KEY, type AttendanceField, type PeribadahanField } from "@/lib/peribadahan";
import { loadPeribadahanRange, type PeribadahanItemRow, type SmkaKelompokRow } from "@/lib/peribadahan-routes";
import { loadWartaFinance, type WartaFinanceItem } from "@/lib/sarana-dana-routes";
import type { ServerSupabase } from "@/lib/supabase/server";
import {
  WARTA_EDITOR_SECTIONS as SECTION,
  wartaDocxSchema,
  type KelengkapanItem,
  type WartaDocxViewModel,
} from "@/lib/warta-docx";
import type { PujianBuku, WartaDetail, WartaKesaksianItemRow, WartaLitbangItemRow, WartaPujianRow } from "@/lib/warta";
import { loadWartaEditor } from "@/lib/warta-routes";

/**
 * Brief §16.2: maps one warta's data to the tag contract in
 * `lib/warta-docx.ts` (docs/warta-template.md). Every date, weekday, time,
 * and amount goes through the shared helpers (Asia/Jakarta calendar dates,
 * id-ID); the Sarana & Dana figures are the core report function's own
 * numbers (`sarana_dana_report`, stage 7), never recomputed here.
 */

// ---------------------------------------------------------------------------
// Source data
// ---------------------------------------------------------------------------

const gerejaSchema = z.object({
  profil: z
    .object({
      alamat: z.string().nullable(),
      telepon: z.string().nullable(),
      telepon_sekretariat: z.string().nullable(),
      email: z.string().nullable(),
      jam_sekretariat: z.string().nullable(),
      website_url: z.string().nullable(),
      instagram_url: z.string().nullable(),
      youtube_url: z.string().nullable(),
      facebook_url: z.string().nullable(),
    })
    .nullable(),
  rekening: z
    .object({ nama_bank: z.string().nullable(), nomor_rekening: z.string().nullable(), atas_nama: z.string().nullable() })
    .nullable(),
  jadwal_rutin: z.array(z.object({ nama: z.string(), keterangan_waktu: z.string() })),
  pendeta: z.array(z.object({ nama: z.string(), no_hp: z.string().nullable() })),
});

export type WartaDocxGereja = z.infer<typeof gerejaSchema>;

type Schedule = { rows: PeribadahanItemRow[]; smkaGroups: Map<string, SmkaKelompokRow[]> };

export type WartaDocxSource = {
  warta: WartaDetail;
  litbang: WartaLitbangItemRow[];
  kesaksian: WartaKesaksianItemRow[];
  pujian: WartaPujianRow[];
  /** Peribadahan rows in the service week (tanggal kebaktian … +6). */
  schedule: Schedule;
  /** Peribadahan rows in the finance week (−7 … −1): the Kehadiran section. */
  attendance: Schedule;
  /** `sarana_dana_report` figures + transactions for the finance week. */
  finance: WartaFinanceItem[];
  gereja: WartaDocxGereja;
};

/** Everything one warta's DOCX needs, read with the caller's own session. `null` when there is no such warta. */
export async function loadWartaDocxSource(supabase: ServerSupabase, wartaId: string): Promise<WartaDocxSource | null> {
  const editor = await loadWartaEditor(supabase, wartaId);
  if (editor.error) throw new Error(`[warta-docx] warta ${wartaId}: ${editor.error}`);
  if (!editor.data) return null;

  const { warta, litbang, kesaksian, pujian } = editor.data;
  const service = serviceWeek(warta.tanggalKebaktian);
  const finance = financeWeek(warta.tanggalKebaktian);

  // One schedule read covers both weeks (they are adjacent), split by date below.
  const [scheduleRes, financeRes, gerejaRes] = await Promise.all([
    loadPeribadahanRange(supabase, { start: finance.start, end: service.end }),
    loadWartaFinance(supabase, finance),
    supabase.rpc("warta_docx_gereja"),
  ]);
  if (!scheduleRes.data) throw new Error(`[warta-docx] schedule: ${scheduleRes.error}`);
  if (!financeRes.data) throw new Error(`[warta-docx] finance: ${financeRes.error}`);
  if (gerejaRes.error) throw new Error(`[warta-docx] gereja: ${gerejaRes.error.message}`);

  const inRange = (range: DateRange) => (row: PeribadahanItemRow) => row.tanggal >= range.start && row.tanggal <= range.end;
  const { rows, smkaGroups } = scheduleRes.data;

  return {
    warta,
    litbang,
    kesaksian,
    pujian,
    schedule: { rows: rows.filter(inRange(service)), smkaGroups },
    attendance: { rows: rows.filter(inRange(finance)), smkaGroups },
    finance: financeRes.data,
    gereja: gerejaSchema.parse(gerejaRes.data),
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

// Characters XML 1.0 can't carry at all; escaping doesn't help, so they go.
const XML_INVALID = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

/** Free text for the document: never null, CRLF → LF (docxtemplater turns LF into a line break). */
function clean(value: string | null | undefined): string {
  return (value ?? "").replace(/\r\n?/g, "\n").replace(XML_INVALID, "").trim();
}

function filled(value: string | null | undefined): boolean {
  return clean(value) !== "";
}

/**
 * An http(s) URL for print, without the scheme ("www.example.org/x"), or ""
 * for anything else ("javascript:…", malformed). The template has no
 * hyperlinks, but nothing other than http(s) is printed as a link either way.
 */
export function printableUrl(value: string | null | undefined): string {
  const raw = clean(value);
  if (!raw) return "";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "";
  return `${url.host}${url.pathname === "/" ? "" : url.pathname}${url.search}`.replace(/\/$/, "");
}

/** "@gkprangkasbitung" from an Instagram profile URL; the bare URL when it has no single handle. */
function instagramHandle(value: string | null | undefined): string {
  const printable = printableUrl(value);
  if (!printable) return "";
  const segments = new URL(clean(value)).pathname.split("/").filter(Boolean);
  return segments.length === 1 ? `@${segments[0]}` : printable;
}

function waktu(jam: string | null): string {
  return jam ? formatJam(jam) : "";
}

const PUJIAN_BUKU_LABELS: Record<PujianBuku, string> = {
  KJ: "Kidung Jemaat",
  PKJ: "Pelengkap Kidung Jemaat",
  NKB: "Nyanyian Kidung Baru",
  // The original template leaves the book cell blank for songs outside the three books.
  Lainnya: "",
};

/** "08.00 WIB dan 11.00 WIB" */
function joinTimes(times: string[]): string {
  const labels = times.map((t) => `${t} WIB`);
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} dan ${labels.at(-1)}`;
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

/** Peribadahan category keys → the view model's section; unknown keys use the `umum` layout (brief §9.5). */
const SECTION_BY_KEY: Record<string, "pemahaman_alkitab" | "kebaktian_lansia" | "kebaktian_perempuan" | "kebaktian_pria" | "kebaktian_pemuda_remaja"> = {
  pa: "pemahaman_alkitab",
  lansia: "kebaktian_lansia",
  perempuan: "kebaktian_perempuan",
  pria: "kebaktian_pria",
  pemuda_remaja: "kebaktian_pemuda_remaja",
};

/** `umum`, and any unknown key (brief §9.5: it uses the `umum` layout): the Kebaktian Minggu section. */
function isKebaktianMinggu(key: string): boolean {
  return key !== SMKA_KEY && key !== "krt" && key !== "doa_pagi" && !SECTION_BY_KEY[key];
}

function groupBy<T>(items: T[], key: (item: T) => string): T[][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = groups.get(k);
    if (list) list.push(item);
    else groups.set(k, [item]);
  }
  return [...groups.values()];
}

function smkaPf(groups: SmkaKelompokRow[] | undefined, kelompok: string): string {
  return clean(groups?.find((g) => g.kelompok === kelompok)?.pfNama);
}

function peribadahanSection(schedule: Schedule): WartaDocxViewModel["peribadahan"] {
  const section: WartaDocxViewModel["peribadahan"] = {
    kebaktian_minggu: [],
    petugas_pujian: { tampil: false, baris: [] },
    smka: [],
    krt: [],
    pemahaman_alkitab: [],
    kebaktian_lansia: [],
    kebaktian_perempuan: [],
    kebaktian_pria: [],
    doa_pagi: { tampil: false, baris: [] },
    kebaktian_pemuda_remaja: [],
  };

  const umum: PeribadahanItemRow[] = [];
  const krt: PeribadahanItemRow[] = [];
  for (const row of schedule.rows) {
    const day = { hari: formatDayName(row.tanggal), tanggal: formatDateShort(row.tanggal), waktu: waktu(row.jam) };
    if (row.categoryKey === SMKA_KEY) {
      const groups = schedule.smkaGroups.get(row.id);
      section.smka.push({
        ...day,
        pf_batita: smkaPf(groups, "batita"),
        pf_balita: smkaPf(groups, "balita"),
        pf_kecil: smkaPf(groups, "kecil"),
        pf_tanggung: smkaPf(groups, "tanggung"),
        pf_besar: smkaPf(groups, "besar"),
        pf_tunas_remaja: smkaPf(groups, "tunas_remaja"),
        pelayan_liturgi: clean(row.liturgosNama),
        pemusik: clean(row.pemusikNama),
        bahan_alkitab: clean(row.bahanAlkitab),
        tema: clean(row.tema),
      });
    } else if (row.categoryKey === "krt") {
      krt.push(row);
    } else if (row.categoryKey === "doa_pagi") {
      section.doa_pagi.baris.push({ ...day, tempat: clean(row.tempatNama) });
    } else if (!isKebaktianMinggu(row.categoryKey)) {
      section[SECTION_BY_KEY[row.categoryKey]!].push({
        ...day,
        tempat: clean(row.tempatNama),
        pf: clean(row.pelayanFirmanNama),
        liturgos: clean(row.liturgosNama),
        dpa: clean(row.dpa),
        tema: clean(row.tema),
      });
    } else {
      umum.push(row);
    }
  }

  section.kebaktian_minggu = groupBy(umum, (row) => row.tanggal).map((rows) => ({
    hari: formatDayName(rows[0]!.tanggal),
    tanggal: formatDateShort(rows[0]!.tanggal),
    baris: rows.map((row) => ({
      waktu: waktu(row.jam),
      tempat: clean(row.tempatNama),
      pf: clean(row.pelayanFirmanNama),
      liturgos: clean(row.liturgosNama),
      keterangan: clean(row.catatan),
    })),
  }));
  section.petugas_pujian.baris = umum.map((row) => ({
    hari: formatDayName(row.tanggal),
    tanggal: formatDateShort(row.tanggal),
    waktu: waktu(row.jam),
    pnj: clean(row.pnjNama),
    pemusik: clean(row.pemusikNama),
  }));
  section.petugas_pujian.tampil = section.petugas_pujian.baris.length > 0;
  section.krt = groupBy(krt, (row) => `${row.tanggal}|${row.jam ?? ""}`).map((rows) => ({
    hari: formatDayName(rows[0]!.tanggal),
    tanggal: formatDateShort(rows[0]!.tanggal),
    waktu: waktu(rows[0]!.jam),
    baris: rows.map((row) => ({
      wilayah: clean(row.wilayahNama),
      tempat: clean(row.tempatNama),
      pf: clean(row.pelayanFirmanNama),
      liturgos: clean(row.liturgosNama),
      dpa: clean(row.dpa),
      tema: clean(row.tema),
    })),
  }));
  section.doa_pagi.tampil = section.doa_pagi.baris.length > 0;
  return section;
}

const ZERO_REPORT = { saldoAwal: 0, pemasukan: 0, pengeluaran: 0, saldoAkhir: 0 };

function kasSection(item: WartaFinanceItem | undefined, range: DateRange): WartaDocxViewModel["sarana_dana"]["kas_jemaat"] {
  const report = item?.report ?? ZERO_REPORT;
  // The loader lists newest first; the ledger reads oldest first.
  const rows = [...(item?.rows ?? [])].reverse();
  const line = (row: WartaFinanceItem["rows"][number]) => ({
    tanggal: formatDayMonthShort(row.tanggal),
    keterangan: clean(row.keterangan),
    jumlah: formatAmount(row.jumlah),
  });
  return {
    saldo_awal_tanggal: formatDateShort(range.start),
    saldo_awal: formatAmount(report.saldoAwal),
    penerimaan: rows.filter((row) => row.tipe === "masuk").map(line),
    pengeluaran: rows.filter((row) => row.tipe === "keluar").map(line),
    total_penerimaan: formatAmount(report.pemasukan),
    total_pengeluaran: formatAmount(report.pengeluaran),
    saldo_akhir_tanggal: formatDateShort(range.end),
    saldo_akhir: formatAmount(report.saldoAkhir),
  };
}

/**
 * Persembahan Bulanan (brief §16.2): names only, never an amount; a
 * transaction without a jemaat (or whose jemaat was deleted) is "NN". Two
 * names per row (left/right), numbered on, the date only on a date's first row.
 */
function persembahanBulanan(item: WartaFinanceItem | undefined): WartaDocxViewModel["sarana_dana"]["persembahan_bulanan"] {
  const rows = [...(item?.rows ?? [])].reverse();
  const result: WartaDocxViewModel["sarana_dana"]["persembahan_bulanan"] = [];
  let no = 0;
  for (const day of groupBy(rows, (row) => row.tanggal)) {
    const names = day.map((row) => clean(row.jemaatNama) || "NN");
    for (let i = 0; i < names.length; i += 2) {
      const left = ++no;
      const right = i + 1 < names.length ? ++no : null;
      result.push({
        tanggal: i === 0 ? formatDayMonthShort(day[0]!.tanggal) : "",
        no_kiri: String(left),
        nama_kiri: names[i]!,
        no_kanan: right === null ? "" : String(right),
        nama_kanan: right === null ? "" : names[i + 1]!,
      });
    }
  }
  return result;
}

const ATTENDANCE_SHORT: Record<Exclude<AttendanceField, "online">, string> = { lakiLaki: "L", perempuan: "P", anak: "A" };

function attendanceValue(row: PeribadahanItemRow, field: AttendanceField): number | null {
  switch (field) {
    case "lakiLaki":
      return row.kehadiranLakiLaki;
    case "perempuan":
      return row.kehadiranPerempuan;
    case "anak":
      return row.kehadiranAnak;
    case "online":
      return row.kehadiranOnline;
  }
}

/** Kehadiran (brief §16.2): every finance-week row with attendance data, with a per-service total and the SMKA groups. */
function kehadiranSection(attendance: Schedule): WartaDocxViewModel["kehadiran"] {
  const layanan: WartaDocxViewModel["kehadiran"]["layanan"] = [];
  for (const row of attendance.rows) {
    const head = {
      judul: clean(row.categoryName),
      hari: formatDayName(row.tanggal),
      tanggal: formatDateShort(row.tanggal),
      waktu: waktu(row.jam),
    };

    if (row.categoryKey === SMKA_KEY) {
      const groups = attendance.smkaGroups.get(row.id) ?? [];
      const baris: { label: string; rincian: string }[] = [];
      let total = 0;
      for (const config of SMKA_GROUPS) {
        const group = groups.find((g) => g.kelompok === config.key);
        if (!group || (group.lakiLaki === null && group.perempuan === null)) continue;
        const parts: string[] = [];
        if (group.lakiLaki !== null) parts.push(`L : ${group.lakiLaki} orang`);
        if (group.perempuan !== null) parts.push(`P : ${group.perempuan} orang`);
        total += (group.lakiLaki ?? 0) + (group.perempuan ?? 0);
        baris.push({ label: config.label, rincian: parts.join(", ") });
      }
      if (baris.length > 0) layanan.push({ ...head, total: String(total), baris });
      continue;
    }

    const layout = layoutFor(row.categoryKey);
    const parts: string[] = [];
    let total = 0;
    for (const field of layout.attendance) {
      if (field === "online") continue;
      const value = attendanceValue(row, field);
      if (value === null) continue;
      parts.push(`${ATTENDANCE_SHORT[field]} : ${value} orang`);
      total += value;
    }
    const online = layout.attendance.includes("online") ? row.kehadiranOnline : null;
    if (parts.length === 0 && online === null) continue;
    if (online !== null) total += online;

    const baris: { label: string; rincian: string }[] = [];
    // A KRT row's counts are per wilayah; elsewhere the label marks onsite vs. online.
    const label = row.categoryKey === "krt" ? clean(row.wilayahNama) : online !== null ? "Onsite" : "";
    if (parts.length > 0) baris.push({ label, rincian: parts.join(", ") });
    if (online !== null) baris.push({ label: "", rincian: `Online : ${online} orang` });
    layanan.push({ ...head, total: String(total), baris });
  }
  return { tampil: layanan.length > 0, layanan };
}

function gerejaSection(gereja: WartaDocxGereja): WartaDocxViewModel["gereja"] {
  const profil = gereja.profil;
  const kontak: { label: string; nilai: string }[] = [];
  const add = (label: string, nilai: string) => {
    if (nilai) kontak.push({ label, nilai });
  };
  add("Telp. Sekretariat", profil?.telepon_sekretariat ? formatPhone(clean(profil.telepon_sekretariat)) : "");
  add("WhatsApp", profil?.telepon ? formatPhone(clean(profil.telepon)) : "");
  add("Email", clean(profil?.email));
  add("Jam Sekretariat", clean(profil?.jam_sekretariat));
  add("Website", printableUrl(profil?.website_url));
  add("Instagram", instagramHandle(profil?.instagram_url));
  add("YouTube", printableUrl(profil?.youtube_url));
  add("Facebook", printableUrl(profil?.facebook_url));

  const rekening = {
    nama_bank: clean(gereja.rekening?.nama_bank),
    atas_nama: clean(gereja.rekening?.atas_nama),
    nomor_rekening: clean(gereja.rekening?.nomor_rekening),
  };
  return {
    jadwal_rutin: gereja.jadwal_rutin.map((j) => ({ nama: clean(j.nama), keterangan_waktu: clean(j.keterangan_waktu) })),
    alamat: clean(profil?.alamat),
    kontak,
    pendeta: gereja.pendeta.map((p) => ({ nama: clean(p.nama), no_hp: p.no_hp ? formatPhone(clean(p.no_hp)) : "" })),
    rekening: { tampil: Object.values(rekening).some(Boolean), ...rekening },
  };
}

// ---------------------------------------------------------------------------
// Kelengkapan Warta
// ---------------------------------------------------------------------------

const FIELD_LABELS: Partial<Record<PeribadahanField, string>> = {
  tempat: "Tempat",
  wilayah: "Wilayah",
  dpa: "DPA",
  tema: "Tema",
  pelayanFirman: "Pelayan Firman",
  liturgos: "Liturgos",
  pemusik: "Pemusik",
  pnj: "Pemandu Nyanyian Jemaat",
  bahanAlkitab: "Bahan Alkitab",
};

const FIELD_VALUE: Partial<Record<PeribadahanField, (row: PeribadahanItemRow) => string | null>> = {
  tempat: (row) => row.tempatNama,
  wilayah: (row) => row.wilayahNama,
  dpa: (row) => row.dpa,
  tema: (row) => row.tema,
  pelayanFirman: (row) => row.pelayanFirmanNama,
  liturgos: (row) => row.liturgosNama,
  pemusik: (row) => row.pemusikNama,
  pnj: (row) => row.pnjNama,
  bahanAlkitab: (row) => row.bahanAlkitab,
};

/** Missing data that would print as an empty cell, each linking to where it's filled in. */
function kelengkapan(source: WartaDocxSource, vm: WartaDocxViewModel): KelengkapanItem[] {
  const items: KelengkapanItem[] = [];
  const add = (pesan: string, href: string) => items.push({ pesan, href });
  const section = (id: string) => `#${id}`;
  const { warta } = source;

  if (!filled(warta.temaKebaktian)) add("Tema kebaktian belum diisi.", section(SECTION.informasi));
  const renungan = [
    ["Judul Renungan", warta.renunganJudul],
    ["Kitab Renungan", warta.renunganKitab],
    ["Ayat Renungan", warta.renunganAyat],
    ["Isi Renungan", warta.renunganIsi],
  ] as const;
  const renunganKosong = renungan.filter(([, value]) => !filled(value)).map(([label]) => label);
  if (renunganKosong.length > 0) add(`${renunganKosong.join(", ")} belum diisi.`, section(SECTION.informasi));

  if (vm.peribadahan.kebaktian_minggu.length === 0) {
    add("Belum ada jadwal Kebaktian Minggu di minggu kebaktian ini.", section(SECTION.peribadahan));
  }
  for (const row of source.schedule.rows) {
    const layout = layoutFor(row.categoryKey);
    const missing = layout.fields.flatMap((field) => {
      const value = FIELD_VALUE[field];
      return value && !filled(value(row)) ? [FIELD_LABELS[field]!] : [];
    });
    if (layout.fields.includes("waktu") && !row.jam) missing.unshift("Waktu");
    if (row.categoryKey === SMKA_KEY) {
      const groups = source.schedule.smkaGroups.get(row.id);
      for (const config of SMKA_GROUPS) {
        if (config.hasPf && !smkaPf(groups, config.key)) missing.push(`PF ${config.label}`);
      }
    }
    if (missing.length > 0) {
      const when = [formatDayDateShort(row.tanggal), row.jam ? formatJam(row.jam) : null].filter(Boolean).join(" ");
      add(`${row.categoryName} (${when}): ${missing.join(", ")} belum diisi.`, section(SECTION.peribadahan));
    }
  }

  if (source.litbang.length === 0) add("Bidang Litbang masih kosong.", section(SECTION.litbang));
  for (const card of source.litbang) {
    if (!filled(card.deskripsi)) add(`Litbang "${card.name}" belum ada deskripsinya.`, section(SECTION.litbang));
  }

  if (source.finance.every((item) => item.rows.length === 0)) {
    add("Belum ada transaksi Sarana & Dana di minggu sebelumnya.", section(SECTION.saranaDana));
  }

  if (source.kesaksian.length === 0) add("Bidang Kesaksian dan Keesaan masih kosong.", section(SECTION.kesaksian));

  const bacaan = [
    ["Tata Kebaktian", warta.tataKebaktian],
    ["Nas Pembimbing", warta.nasPembimbing],
    ["Pembacaan Alkitab", warta.pembacaanAlkitab],
    ["Pembacaan Mazmur", warta.pembacaanMazmur],
  ] as const;
  const bacaanKosong = bacaan.filter(([, value]) => !filled(value)).map(([label]) => label);
  if (bacaanKosong.length > 0) add(`Bahan Bacaan: ${bacaanKosong.join(", ")} belum diisi.`, section(SECTION.bahanBacaan));
  if (source.pujian.length === 0) add("Daftar Pujian masih kosong.", section(SECTION.bahanBacaan));

  if (!vm.kehadiran.tampil) add("Tidak ada data kehadiran di minggu sebelumnya.", "/admin/peribadahan");

  if (vm.gereja.jadwal_rutin.length === 0) add("Jadwal rutin di Profil Gereja masih kosong.", "/admin/profil-gereja");
  if (!vm.gereja.alamat) add("Alamat sekretariat di Profil Gereja belum diisi.", "/admin/profil-gereja");
  if (!vm.gereja.rekening.tampil) add("Rekening persembahan di Profil Gereja belum diisi.", "/admin/profil-gereja");
  if (vm.gereja.pendeta.length === 0) add("Belum ada pendeta yang melayani dan ditampilkan di warta.", "/admin/pendeta");

  return items;
}

// ---------------------------------------------------------------------------
// The view model
// ---------------------------------------------------------------------------

/** Pure: maps loaded data to the view model and the Kelengkapan list. Validated against the contract. */
export function toWartaViewModel(source: WartaDocxSource): { viewModel: WartaDocxViewModel; kelengkapan: KelengkapanItem[] } {
  const { warta } = source;
  const finance = financeWeek(warta.tanggalKebaktian);
  const byKey = new Map(source.finance.map((item) => [item.key, item]));

  // "PUKUL 08.00 WIB dan 11.00 WIB": the Kebaktian Minggu times on the kebaktian date itself.
  const mingguTimes = source.schedule.rows
    .filter((row) => row.tanggal === warta.tanggalKebaktian && row.jam && isKebaktianMinggu(row.categoryKey))
    .map((row) => formatJam(row.jam));

  const viewModel: WartaDocxViewModel = {
    informasi: {
      hari: formatDayName(warta.tanggalKebaktian),
      tanggal: formatDateShort(warta.tanggalKebaktian),
      judul: clean(warta.judulKebaktian),
      tema: clean(warta.temaKebaktian),
    },
    renungan: {
      judul: clean(warta.renunganJudul),
      ayat: clean(warta.renunganAyat),
      kitab: clean(warta.renunganKitab),
      isi: clean(warta.renunganIsi),
      sumber: clean(warta.renunganSumber),
    },
    gereja: gerejaSection(source.gereja),
    peribadahan: peribadahanSection(source.schedule),
    litbang: source.litbang.map((card) => ({ nama: clean(card.name), deskripsi: clean(card.deskripsi) })),
    sarana_dana: {
      kas_jemaat: kasSection(byKey.get("kas_jemaat"), finance),
      kas_sarana_prasarana: kasSection(byKey.get("kas_sarana_prasarana"), finance),
      persembahan_bulanan: persembahanBulanan(byKey.get("persembahan_bulanan")),
    },
    kesaksian: source.kesaksian.map((item, i) => ({
      nomor: String(i + 1),
      judul: clean(item.judul),
      deskripsi: clean(item.deskripsi),
    })),
    bacaan: {
      pukul: joinTimes([...new Set(mingguTimes)]),
      tata_kebaktian: clean(warta.tataKebaktian),
      nas_pembimbing: clean(warta.nasPembimbing),
      pembacaan_alkitab: clean(warta.pembacaanAlkitab),
      pembacaan_mazmur: clean(warta.pembacaanMazmur),
      pujian: source.pujian.map((p) => ({
        buku: PUJIAN_BUKU_LABELS[p.buku],
        nomor: [clean(p.nomor), clean(p.keterangan)].filter(Boolean).join(" : "),
      })),
    },
    kehadiran: kehadiranSection(source.attendance),
  };

  // The contract is the schema: an unmapped or extra key fails here, not as a blank in print.
  return { viewModel: wartaDocxSchema.parse(viewModel), kelengkapan: kelengkapan(source, viewModel) };
}

/** Brief §16.3: one warta's view model + Kelengkapan, or `null` when the warta doesn't exist. */
export async function buildWartaViewModel(
  supabase: ServerSupabase,
  wartaId: string,
): Promise<{ warta: WartaDetail; viewModel: WartaDocxViewModel; kelengkapan: KelengkapanItem[] } | null> {
  const source = await loadWartaDocxSource(supabase, wartaId);
  if (!source) return null;
  return { warta: source.warta, ...toWartaViewModel(source) };
}
