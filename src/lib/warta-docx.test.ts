import { readFileSync } from "node:fs";

import Docxtemplater from "docxtemplater";
import expressionParser from "docxtemplater/expressions.js";
import PizZip from "pizzip";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { PeribadahanItemRow, SmkaKelompokRow } from "@/lib/peribadahan-routes";
import type { WartaFinanceItem } from "@/lib/sarana-dana-routes";
import { wartaDocxFileName, wartaDocxSchema, type WartaDocxViewModel } from "@/lib/warta-docx";

vi.mock("server-only", () => ({}));

const { canonicalJson, renderWartaDocx, WARTA_TEMPLATE_PATH, wartaContentHash } = await import("@/lib/warta-docx-render");
const { printableUrl, toWartaViewModel } = await import("@/lib/warta-docx-view-model");
type WartaDocxSource = import("@/lib/warta-docx-view-model").WartaDocxSource;

// ---------------------------------------------------------------------------
// Fixture: tanggal kebaktian Minggu 4 Oktober 2026; service week 4–10 Oktober,
// finance week 27 September – 3 Oktober.
// ---------------------------------------------------------------------------

const CATEGORY_NAMES: Record<string, string> = {
  umum: "Kebaktian Minggu",
  smka: "Kebaktian SMKA",
  krt: "Kebaktian Rumah Tangga",
  pa: "Pemahaman Alkitab",
  lansia: "Kebaktian Lansia",
  perempuan: "Kebaktian Perempuan",
  pria: "Kebaktian Pria",
  doa_pagi: "Doa Pagi",
  pemuda_remaja: "Kebaktian Pemuda Remaja",
};

let seq = 0;
function row(categoryKey: string, tanggal: string, fields: Partial<PeribadahanItemRow> = {}): PeribadahanItemRow {
  seq += 1;
  return {
    id: `row-${seq}`,
    categoryId: `cat-${categoryKey}`,
    categoryKey,
    categoryName: CATEGORY_NAMES[categoryKey] ?? categoryKey,
    tanggal,
    jam: "19:00:00",
    tempatId: null,
    tempatNama: `Tempat ${seq}`,
    wilayahId: null,
    wilayahNama: null,
    pelayanFirmanId: null,
    pelayanFirmanNama: `PF ${seq}`,
    liturgosId: null,
    liturgosNama: `Liturgos ${seq}`,
    pemusikId: null,
    pemusikNama: null,
    pnjId: null,
    pnjNama: null,
    tema: `Tema ${seq}`,
    dpa: `DPA ${seq}`,
    catatan: null,
    bahanAlkitab: null,
    kehadiranLakiLaki: null,
    kehadiranPerempuan: null,
    kehadiranAnak: null,
    kehadiranOnline: null,
    sortOrder: 0,
    ...fields,
  };
}

function smkaGroups(prefix: string, counts = false): SmkaKelompokRow[] {
  return (["batita", "balita", "kecil", "tanggung", "besar", "tunas_remaja", "guru_sekolah_minggu", "orang_tua"] as const).map(
    (kelompok, i) => ({
      kelompok,
      pfId: null,
      pfNama: i < 6 ? `${prefix} PF ${kelompok}` : null,
      lakiLaki: counts ? i + 1 : null,
      perempuan: counts ? i + 2 : null,
    }),
  );
}

function transaction(
  itemId: string,
  tanggal: string,
  tipe: "masuk" | "keluar",
  jumlah: number,
  extra: Partial<WartaFinanceItem["rows"][number]> = {},
): WartaFinanceItem["rows"][number] {
  seq += 1;
  return { id: `tx-${seq}`, itemId, tanggal, tipe, jumlah, jemaatId: null, jemaatNama: null, keterangan: `Transaksi ${seq}`, ...extra };
}

/** `rows` are given oldest first; stored newest first, like `loadWartaFinance` (tanggal desc, created_at desc). */
function financeItem(key: string, name: string, report: WartaFinanceItem["report"], rows: WartaFinanceItem["rows"]): WartaFinanceItem {
  return { id: `item-${key}`, key, name, report, rows: [...rows].reverse() };
}

function fullSource(): WartaDocxSource {
  const smka = row("smka", "2026-10-04", { jam: "08:00:00", pemusikNama: "Pemusik SMKA", bahanAlkitab: "Markus 10" });
  const smkaLalu = row("smka", "2026-09-27", { jam: "08:00:00" });
  return {
    warta: {
      id: "warta-1",
      slug: "2026-10-04-minggu-xviii",
      status: "draft",
      publishedAt: null,
      updatedAt: "2026-10-01T00:00:00Z",
      tanggalKebaktian: "2026-10-04",
      judulKebaktian: 'Minggu <XVIII> & "Doa"',
      temaKebaktian: "Hidup dalam kasih",
      renunganJudul: "Kasih yang sabar",
      renunganKitab: "1 Korintus 13:4-7",
      renunganAyat: "Kasih itu sabar;\r\nkasih itu murah hati",
      renunganIsi: "Paragraf satu.\nParagraf dua.",
      renunganSumber: "Renungan Harian",
      tataKebaktian: "GKP",
      nasPembimbing: "Mazmur 133:1",
      pembacaanAlkitab: "Yohanes 15:9-17",
      pembacaanMazmur: "Mazmur 23",
    },
    litbang: [
      { id: "l1", name: "Katekisasi", deskripsi: "Setiap Sabtu\npkl. 17.00 WIB" },
      { id: "l2", name: "Kunjungan Rutin", deskripsi: "Wilayah 1" },
    ],
    kesaksian: [{ id: "k1", judul: "Diakonia", deskripsi: "Bantuan bencana" }],
    pujian: [
      { id: "p1", urutan: 0, buku: "KJ", nomor: "12", keterangan: "1-3" },
      { id: "p2", urutan: 1, buku: "Lainnya", nomor: null, keterangan: "Lagu Pujian" },
    ],
    schedule: {
      rows: [
        row("umum", "2026-10-04", { jam: "08:00:00", pnjNama: "PNJ Pagi", pemusikNama: "Musik Pagi", catatan: "Perjamuan Kudus" }),
        row("umum", "2026-10-04", { jam: "11:00:00", pnjNama: "PNJ Siang", pemusikNama: "Musik Siang" }),
        smka,
        row("doa_pagi", "2026-10-05", { jam: "05:00:00", tempatNama: "Gedung Gereja" }),
        row("krt", "2026-10-07", { wilayahNama: "Wilayah 1" }),
        row("krt", "2026-10-07", { wilayahNama: "Wilayah 2" }),
        row("pa", "2026-10-07"),
        row("lansia", "2026-10-08", { jam: "10:00:00" }),
        row("perempuan", "2026-10-08", { jam: "17:00:00" }),
        row("pria", "2026-10-10"),
        row("pemuda_remaja", "2026-10-10"),
      ],
      smkaGroups: new Map([[smka.id, smkaGroups("Minggu Ini")]]),
    },
    attendance: {
      rows: [
        row("umum", "2026-09-27", { jam: "08:00:00", kehadiranLakiLaki: 90, kehadiranPerempuan: 87, kehadiranAnak: 4, kehadiranOnline: 7 }),
        smkaLalu,
        row("krt", "2026-09-30", { wilayahNama: "Wilayah 1", kehadiranLakiLaki: 10, kehadiranPerempuan: 13, kehadiranAnak: 1 }),
        row("pria", "2026-10-03"), // no attendance data: left out
      ],
      smkaGroups: new Map([[smkaLalu.id, smkaGroups("Lalu", true)]]),
    },
    finance: [
      financeItem("kas_jemaat", "Kas Jemaat", { saldoAwal: 1_000_000, pemasukan: 750_000, pengeluaran: 250_000, saldoAkhir: 1_500_000 }, [
        transaction("item-kas_jemaat", "2026-09-27", "masuk", 500_000, { keterangan: "Persembahan Minggu" }),
        transaction("item-kas_jemaat", "2026-09-28", "masuk", 250_000),
        transaction("item-kas_jemaat", "2026-09-30", "keluar", 250_000, { keterangan: "Listrik" }),
      ]),
      financeItem("kas_sarana_prasarana", "Kas Sarana dan Prasarana", { saldoAwal: 0, pemasukan: 0, pengeluaran: 0, saldoAkhir: 0 }, []),
      financeItem("persembahan_bulanan", "Persembahan Bulanan", { saldoAwal: 0, pemasukan: 2_468_013, pengeluaran: 0, saldoAkhir: 2_468_013 }, [
        transaction("item-persembahan_bulanan", "2026-09-27", "masuk", 1_234_567, { jemaatNama: "Budi Santoso" }),
        transaction("item-persembahan_bulanan", "2026-09-27", "masuk", 1_000_000),
        transaction("item-persembahan_bulanan", "2026-09-29", "masuk", 233_446, { jemaatNama: "Sari" }),
      ]),
    ],
    gereja: {
      profil: {
        alamat: "Jl. Contoh No. 1",
        telepon: "081234567890",
        telepon_sekretariat: "0252202416",
        email: "sekretariat@example.org",
        jam_sekretariat: "Senin–Jumat 08.00–15.00",
        website_url: "javascript:alert(1)",
        instagram_url: "https://www.instagram.com/gkpcontoh/",
        youtube_url: "https://www.youtube.com/@gkpcontoh",
        facebook_url: null,
      },
      rekening: { nama_bank: "Bank Contoh", nomor_rekening: "123-456-789", atas_nama: "GKP Contoh" },
      jadwal_rutin: [{ nama: "Kebaktian Minggu", keterangan_waktu: "Minggu, pkl. 08.00 WIB" }],
      pendeta: [{ nama: "Pdt. Contoh", no_hp: "081200001111" }],
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const templateBytes = readFileSync(WARTA_TEMPLATE_PATH);

function decode(xml: string): string {
  return xml
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** The rendered body as text: one line per paragraph, `<w:br/>` as "\n". */
function documentXml(docx: Buffer): string {
  return new PizZip(docx).file("word/document.xml")!.asText();
}

function documentText(docx: Buffer): string {
  return documentXml(docx)
    .split("</w:p>")
    .map((p) =>
      [...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:br\/>/g)].map((m) => (m[0] === "<w:br/>" ? "\n" : decode(m[1]!))).join(""),
    )
    .join("\n");
}

async function render(source: WartaDocxSource) {
  const { viewModel } = toWartaViewModel(source);
  return { viewModel, text: documentText(await renderWartaDocx(viewModel, { strict: true, templateBytes })) };
}

// ---------------------------------------------------------------------------
// Template ↔ contract
// ---------------------------------------------------------------------------

type Node = { kind: "leaf" } | { kind: "object"; shape: Record<string, Node> } | { kind: "array"; element: Node };

function describeSchema(schema: z.ZodType): Node {
  if (schema instanceof z.ZodObject) {
    return { kind: "object", shape: Object.fromEntries(Object.entries(schema.shape).map(([k, v]) => [k, describeSchema(v as z.ZodType)])) };
  }
  if (schema instanceof z.ZodArray) return { kind: "array", element: describeSchema(schema.element as z.ZodType) };
  if (schema instanceof z.ZodString || schema instanceof z.ZodBoolean) return { kind: "leaf" };
  throw new Error(`Unexpected schema type in the warta contract: ${schema.constructor.name}`);
}

/** Every leaf path of the contract, e.g. "peribadahan.krt[].baris[].wilayah". */
function leafPaths(node: Node, prefix = ""): string[] {
  if (node.kind === "leaf") return [prefix];
  if (node.kind === "array") return leafPaths(node.element, `${prefix}[]`);
  return Object.entries(node.shape).flatMap(([key, child]) => leafPaths(child, prefix ? `${prefix}.${key}` : key));
}

type Part = { type: string; value?: string; module?: string; subparsed?: Part[] };
type Scope = { node: Node; path: string };

/**
 * Walks the compiled template the way the expressions parser resolves tags:
 * the innermost loop scope first, then outward. Returns the contract paths
 * each tag resolved to, and the tags that resolved to nothing.
 */
function resolveTemplateTags(parts: Part[], scopes: Scope[], used: Set<string>, unmapped: string[]) {
  for (const part of parts) {
    if (part.type !== "placeholder" || !part.value) continue;
    let resolved: Scope | null = null;
    for (const scope of [...scopes].reverse()) {
      let node: Node | undefined = scope.node;
      let path = scope.path;
      for (const key of part.value.split(".")) {
        node = node?.kind === "object" ? node.shape[key] : undefined;
        path = path ? `${path}.${key}` : key;
      }
      if (node) {
        resolved = { node, path };
        break;
      }
    }
    if (!resolved) {
      unmapped.push(part.value);
      continue;
    }
    if (resolved.node.kind === "leaf") used.add(resolved.path);
    if (part.module === "loop" && part.subparsed) {
      // A loop over an array scopes to its element; a condition on a leaf or object keeps the outer scopes.
      const inner: Scope[] =
        resolved.node.kind === "array"
          ? [...scopes, { node: resolved.node.element, path: `${resolved.path}[]` }]
          : resolved.node.kind === "object"
            ? [...scopes, resolved]
            : scopes;
      resolveTemplateTags(part.subparsed, inner, used, unmapped);
    }
  }
}

describe("templates/warta/warta.docx ↔ the view model contract", () => {
  it("every tag in the template maps to the contract, and every contract key is used by the template", () => {
    const doc = new Docxtemplater(new PizZip(templateBytes), { paragraphLoop: true, linebreaks: true, parser: expressionParser });
    const compiled = (doc as unknown as { compiled: Record<string, { postparsed: Part[] }> }).compiled;
    const contract = describeSchema(wartaDocxSchema);
    const used = new Set<string>();
    const unmapped: string[] = [];
    for (const file of Object.values(compiled)) resolveTemplateTags(file.postparsed, [{ node: contract, path: "" }], used, unmapped);

    expect(unmapped).toEqual([]);
    expect(leafPaths(contract).filter((path) => !used.has(path))).toEqual([]);
  });

  it("has no raw-XML tags ({@…}) and no hyperlinks", () => {
    const zip = new PizZip(templateBytes);
    const xml = zip.file("word/document.xml")!.asText();
    expect(documentText(templateBytes)).not.toMatch(/\{@/);
    expect(xml).not.toContain("<w:hyperlink");
    expect(zip.file("word/_rels/document.xml.rels")!.asText()).not.toContain("/hyperlink");
  });
});

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe("renderWartaDocx", () => {
  it("renders a complete warta: no errors, no tags left, no undefined/null", async () => {
    const { text } = await render(fullSource());
    expect(text).not.toMatch(/[{}]/);
    expect(text).not.toMatch(/undefined|null/);
    expect(text).toContain("Minggu, 4 Oktober 2026");
    expect(text).toContain("Kebaktian Rumah Tangga, Rabu 7 Oktober 2026, pkl. 19.00 WIB :");
    expect(text).toContain("Tema : Tema"); // KRT carries a tema per row
    expect(text).toContain("PF Kelas Batita");
    expect(text).toContain("Minggu Ini PF batita");
    expect(text).toContain("PUKUL 08.00 WIB dan 11.00 WIB");
    expect(text).toContain("12 : 1-3");
  });

  it("escapes <, &, and \" and keeps line breaks", async () => {
    const source = fullSource();
    const docx = await renderWartaDocx(toWartaViewModel(source).viewModel, { strict: true, templateBytes });
    const xml = documentXml(docx);
    expect(xml).toContain("Minggu &lt;XVIII&gt; &amp; ");
    expect(xml).not.toContain("<XVIII>");
    const text = documentText(docx);
    expect(text).toContain('Minggu <XVIII> & "Doa"');
    expect(text).toContain("Kasih itu sabar;\nkasih itu murah hati (1 Korintus 13:4-7)");
    expect(text).toContain("Paragraf satu.\nParagraf dua.");
  });

  it("drops a Peribadahan category section with no rows, heading and table included", async () => {
    const source = fullSource();
    const before = await render(source);
    expect(before.text).toContain("Pemahaman Alkitab,");
    expect(before.text).toContain("Doa Pagi");

    source.schedule.rows = source.schedule.rows.filter((r) => r.categoryKey !== "pa" && r.categoryKey !== "doa_pagi");
    const after = await render(source);
    expect(after.text).not.toContain("Pemahaman Alkitab,");
    expect(after.text).not.toContain("Doa Pagi");
    expect(after.viewModel.peribadahan.pemahaman_alkitab).toEqual([]);
  });

  it("drops the Kehadiran section when the finance week has no attendance data", async () => {
    const source = fullSource();
    expect((await render(source)).text).toContain("KEHADIRAN");
    source.attendance.rows = [];
    expect((await render(source)).text).not.toContain("KEHADIRAN");
  });

  it("prints the core report's figures for Sarana & Dana, never recomputed", async () => {
    const source = fullSource();
    const { viewModel, text } = await render(source);
    const kas = viewModel.sarana_dana.kas_jemaat;
    expect([kas.saldo_awal, kas.total_penerimaan, kas.total_pengeluaran, kas.saldo_akhir]).toEqual([
      "1.000.000",
      "750.000",
      "250.000",
      "1.500.000",
    ]);
    expect(kas.saldo_awal_tanggal).toBe("27 September 2026");
    expect(kas.saldo_akhir_tanggal).toBe("3 Oktober 2026");
    // Oldest first, and keluar rows on their own.
    expect(kas.penerimaan.map((r) => r.tanggal)).toEqual(["27 Sep", "28 Sep"]);
    expect(kas.pengeluaran).toEqual([{ tanggal: "30 Sep", keterangan: "Listrik", jumlah: "250.000" }]);
    expect(text).toContain("1.500.000");

    // A figure that differs from the transactions' own sum still prints as the report says.
    source.finance[0]!.report.saldoAkhir = 9_999;
    expect(toWartaViewModel(source).viewModel.sarana_dana.kas_jemaat.saldo_akhir).toBe("9.999");
  });

  it("Persembahan Bulanan: names only, no amounts, \"NN\" without a jemaat, two per row", async () => {
    const { viewModel, text } = await render(fullSource());
    expect(viewModel.sarana_dana.persembahan_bulanan).toEqual([
      { tanggal: "27 Sep", no_kiri: "1", nama_kiri: "Budi Santoso", no_kanan: "2", nama_kanan: "NN" },
      { tanggal: "29 Sep", no_kiri: "3", nama_kiri: "Sari", no_kanan: "", nama_kanan: "" },
    ]);
    for (const amount of ["1.234.567", "233.446", "2.468.013", "1234567"]) expect(text).not.toContain(amount);
    expect(JSON.stringify(viewModel)).not.toMatch(/1234567|1\.234\.567|233\.446|2\.468\.013/);
  });

  it("Kehadiran: totals per service, Online on its own line, SMKA per group", async () => {
    const { viewModel } = await render(fullSource());
    const [minggu, smka, krt] = viewModel.kehadiran.layanan;
    expect(minggu).toMatchObject({
      judul: "Kebaktian Minggu",
      total: "188",
      baris: [
        { label: "Onsite", rincian: "L : 90 orang, P : 87 orang, A : 4 orang" },
        { label: "", rincian: "Online : 7 orang" },
      ],
    });
    expect(smka!.baris[0]).toEqual({ label: "Kelas Batita", rincian: "L : 1 orang, P : 2 orang" });
    expect(smka!.total).toBe(String([1, 2, 3, 4, 5, 6, 7, 8].reduce((sum, l) => sum + l + (l + 1), 0)));
    expect(krt).toMatchObject({ judul: "Kebaktian Rumah Tangga", baris: [{ label: "Wilayah 1" }] });
    expect(viewModel.kehadiran.layanan).toHaveLength(3); // the Pria row has no attendance
  });

  it("never prints a non-http(s) link: javascript: is dropped from the contact list", async () => {
    const { viewModel, text } = await render(fullSource());
    expect(text).not.toContain("javascript");
    expect(viewModel.gereja.kontak.map((k) => k.label)).not.toContain("Website");
    expect(viewModel.gereja.kontak).toContainEqual({ label: "Instagram", nilai: "@gkpcontoh" });
    expect(printableUrl("javascript:alert(1)")).toBe("");
    expect(printableUrl("data:text/html,x")).toBe("");
    expect(printableUrl("https://www.example.org/")).toBe("www.example.org");
  });

  it("throws under strict mode on an unmapped tag, and prints \"\" otherwise", async () => {
    const { viewModel } = toWartaViewModel(fullSource());
    const broken = { ...viewModel, informasi: { ...viewModel.informasi, judul: undefined } } as unknown as WartaDocxViewModel;
    await expect(renderWartaDocx(broken, { strict: true, templateBytes })).rejects.toThrow();

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(renderWartaDocx(broken, { strict: false, templateBytes })).resolves.toBeInstanceOf(Buffer);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("informasi.judul"));
    warn.mockRestore();
  });
});

describe("Kelengkapan Warta", () => {
  it("lists missing data with a link to where it's filled in", () => {
    const source = fullSource();
    source.warta.pembacaanMazmur = null;
    source.pujian = [];
    source.schedule.smkaGroups = new Map();
    const { kelengkapan } = toWartaViewModel(source);
    expect(kelengkapan).toContainEqual({ pesan: "Bahan Bacaan: Pembacaan Mazmur belum diisi.", href: "#bahan-bacaan" });
    expect(kelengkapan).toContainEqual({ pesan: "Daftar Pujian masih kosong.", href: "#bahan-bacaan" });
    expect(kelengkapan.find((k) => k.pesan.startsWith("Kebaktian SMKA"))?.pesan).toContain("PF Kelas Batita");
    expect(kelengkapan.find((k) => k.pesan.startsWith("Kebaktian SMKA"))?.href).toBe("#peribadahan");
  });

  it("flags a week without attendance data", () => {
    const source = fullSource();
    source.attendance.rows = [];
    expect(toWartaViewModel(source).kelengkapan).toContainEqual({
      pesan: "Tidak ada data kehadiran di minggu sebelumnya.",
      href: "/admin/peribadahan",
    });
  });
});

describe("wartaContentHash", () => {
  const version = "template-v1";

  function shuffleKeys(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(shuffleKeys);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).reverse().map(([k, v]) => [k, shuffleKeys(v)]));
    }
    return value;
  }

  it("is stable for the same data, whatever the key order", () => {
    const { viewModel } = toWartaViewModel(fullSource());
    const reordered = shuffleKeys(viewModel) as WartaDocxViewModel;
    expect(JSON.stringify(reordered)).not.toBe(JSON.stringify(viewModel));
    expect(canonicalJson(reordered)).toBe(canonicalJson(viewModel));
    expect(wartaContentHash(reordered, version)).toBe(wartaContentHash(viewModel, version));
  });

  it("changes when a warta field, a schedule row, a transaction, or the template changes", () => {
    const base = wartaContentHash(toWartaViewModel(fullSource()).viewModel, version);

    const warta = fullSource();
    warta.warta.temaKebaktian = "Tema lain";
    const jadwal = fullSource();
    jadwal.schedule.rows[0]!.liturgosNama = "Liturgos lain";
    const transaksi = fullSource();
    transaksi.finance[0]!.rows[0]!.keterangan = "Keterangan lain";

    for (const changed of [warta, jadwal, transaksi]) {
      expect(wartaContentHash(toWartaViewModel(changed).viewModel, version)).not.toBe(base);
    }
    expect(wartaContentHash(toWartaViewModel(fullSource()).viewModel, "template-v2")).not.toBe(base);
  });
});

describe("wartaDocxFileName", () => {
  it("comes from the date and status, never the judul", () => {
    expect(wartaDocxFileName("2026-10-04", "published")).toBe("warta-2026-10-04.docx");
    expect(wartaDocxFileName("2026-10-04", "draft")).toBe("warta-2026-10-04-DRAFT.docx");
  });
});
