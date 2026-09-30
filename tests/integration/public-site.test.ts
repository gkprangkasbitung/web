/**
 * The public site's data (brief §8) against the local stack, through the
 * same cookie-less anon client the pages use:
 * - §13 #17: anon can't read jemaat, keluarga, or single transactions, and a
 *   published warta still loads with all six sections;
 * - §13 #5: the four figures per item equal the editor's (`sarana_dana_report`);
 * - drafts, unknown and malformed slugs load nothing, and "Tarik ke Draft"
 *   takes effect on the very next load (no cache in between);
 * - a renungan holding `<script>` comes back as the literal text;
 * - Jadwal Ibadah's function returns the next 7 days in WIB, names only.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { addDays, financeWeek, nextSunday, today } from "@/lib/dates";

import { actAs, call, signIn, type Session } from "./harness";

// `connection()` only marks the page as request-time rendering; outside a Next
// request it throws, so it's a no-op here. Nothing else in next/server changes.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));

// Server-only modules load after the harness has mocked `server-only`.
const { createPublicClient } = await import("@/lib/supabase/public");
const { loadJadwalMendatang, loadLatestPublicWarta, loadPublicWarta, loadPublicWartaList } = await import(
  "@/lib/public-site"
);
const { loadWartaFinance } = await import("@/lib/sarana-dana-routes");
const collection = await import("@/app/api/admin/warta/route");
const item = await import("@/app/api/admin/warta/[id]/route");
const kesaksian = await import("@/app/api/admin/warta/[id]/kesaksian/route");
const peribadahan = await import("@/app/api/admin/peribadahan/route");
const peribadahanItem = await import("@/app/api/admin/peribadahan/[id]/route");
const transactions = await import("@/app/api/admin/sarana-dana/[id]/transactions/route");

const RUN = Date.now().toString(36);
// A Sunday far in the future, unique per run, so no seeded rows share its weeks.
const SUNDAY = nextSunday(addDays("2040-01-01", Math.floor(Date.now() / 1000) % 40_000));
const SCRIPT_RENUNGAN = `Baris pertama ${RUN}\n<script>alert("x")</script>\n<img src=x onerror=alert(1)>`;

let editor: Session;
let superadmin: Session;
let published: { id: string; slug: string };
let draft: { id: string; slug: string };
let jemaatId: string;
const createdWarta: string[] = [];
const createdScheduleItems: string[] = [];
const createdTransactions: string[] = [];

async function createWarta(body: Record<string, unknown>) {
  actAs(editor);
  const response = await call(collection.POST, { method: "POST", body });
  expect(response.status).toBe(201);
  const created = response.body.data as unknown as { id: string; slug: string };
  createdWarta.push(created.id);
  return created;
}

async function setStatus(id: string, status: "published" | "draft") {
  actAs(editor);
  const response = await call(item.PATCH, { method: "PATCH", params: { id }, body: { status } });
  expect(response.status).toBe(200);
}

beforeAll(async () => {
  [editor, superadmin] = await Promise.all([signIn("editor@gkp.test"), signIn("superadmin@gkp.test")]);

  const { data: person, error } = await superadmin.supabase
    .from("jemaat")
    .insert({ nama: `Contoh Pelayan ${RUN}`, no_hp: "081234567890", alamat: `Jl. Rahasia ${RUN}`, tanggal_lahir: "1970-01-01" })
    .select("id")
    .single();
  if (error) throw error;
  jemaatId = person.id;

  published = await createWarta({
    tanggalKebaktian: SUNDAY,
    judulKebaktian: `Publik ${RUN}`,
    temaKebaktian: `Tema ${RUN}`,
    renunganJudul: "Renungan contoh",
    renunganKitab: "Mazmur 23:1-6",
    renunganIsi: SCRIPT_RENUNGAN,
    renunganSumber: "Sumber contoh",
  });
  draft = await createWarta({ tanggalKebaktian: addDays(SUNDAY, 7), judulKebaktian: `Draft ${RUN}` });

  actAs(editor);
  const kesaksianRes = await call(kesaksian.POST, {
    method: "POST",
    params: { id: published.id },
    body: { judul: `Kesaksian ${RUN}`, deskripsi: "Baris 1\nBaris 2" },
  });
  expect(kesaksianRes.status).toBe(201);

  // A service in the service week with a named Pelayan Firman.
  const added = await call(peribadahan.POST, { method: "POST", body: { categoryKey: "umum", tanggal: addDays(SUNDAY, 2), jam: "18:30" } });
  expect(added.status).toBe(201);
  const scheduleId = (added.body.data as unknown as { id: string }).id;
  createdScheduleItems.push(scheduleId);
  const edited = await call(peribadahanItem.PATCH, {
    method: "PATCH",
    params: { id: scheduleId },
    body: { jam: "18:30", pelayanFirmanId: jemaatId, kehadiranLakiLaki: 4, catatan: `Catatan ${RUN}` },
  });
  expect(edited.status).toBe(200);

  // Transactions in and just before the finance week.
  const week = financeWeek(SUNDAY);
  const { data: kas } = await superadmin.supabase.from("sarana_dana_items").select("id").eq("key", "kas_jemaat").single();
  for (const body of [
    { tanggal: addDays(week.start, -2), tipe: "masuk", jumlah: 40_000 },
    { tanggal: week.start, tipe: "masuk", jumlah: 325_000 },
    { tanggal: week.end, tipe: "keluar", jumlah: 75_000 },
  ]) {
    const response = await call(transactions.POST, { method: "POST", params: { id: kas!.id }, body });
    expect(response.status).toBe(201);
    createdTransactions.push((response.body.data as unknown as { id: string }).id);
  }

  await setStatus(published.id, "published");
});

afterAll(async () => {
  for (const id of createdWarta) await superadmin.supabase.from("warta").delete().eq("id", id);
  for (const id of createdScheduleItems) await superadmin.supabase.from("peribadahan_items").delete().eq("id", id);
  for (const id of createdTransactions) await superadmin.supabase.from("sarana_dana_transactions").delete().eq("id", id);
  if (jemaatId) await superadmin.supabase.from("jemaat").delete().eq("id", jemaatId);
});

describe("§13 #17: the anon key", () => {
  it("can't select jemaat, keluarga, single transactions, balances, or schedule tables directly", async () => {
    const anon = createPublicClient();
    const attempts = {
      jemaat: await anon.from("jemaat").select("*").limit(1),
      keluarga: await anon.from("keluarga").select("*").limit(1),
      sarana_dana_transactions: await anon.from("sarana_dana_transactions").select("*").limit(1),
      sarana_dana_balances: await anon.from("sarana_dana_balances").select("*").limit(1),
      peribadahan_items: await anon.from("peribadahan_items").select("*").limit(1),
      peribadahan_smka_kelompok: await anon.from("peribadahan_smka_kelompok").select("*").limit(1),
    };
    for (const [table, { data, error }] of Object.entries(attempts)) {
      expect(error?.code, table).toBe("42501");
      expect(data, table).toBeNull();
    }
  });

  it("still loads a published warta with every section", async () => {
    const warta = await loadPublicWarta(published.slug);
    expect(warta).not.toBeNull();
    expect(warta).toMatchObject({
      slug: published.slug,
      tanggalKebaktian: SUNDAY,
      judulKebaktian: `Publik ${RUN}`,
      temaKebaktian: `Tema ${RUN}`,
      renunganJudul: "Renungan contoh",
      renunganKitab: "Mazmur 23:1-6",
      renunganSumber: "Sumber contoh",
    });

    const row = warta!.schedule.find((r) => r.id === createdScheduleItems[0]);
    expect(row).toMatchObject({
      categoryKey: "umum",
      jam: "18:30:00",
      pelayanFirmanNama: `Contoh Pelayan ${RUN}`,
      kehadiranLakiLaki: 4,
      catatan: `Catatan ${RUN}`,
    });
    // Names only: nothing else about the person reaches the page's data.
    expect(JSON.stringify(warta)).not.toMatch(/081234567890|Rahasia|1970-01-01/);

    expect(warta!.finance.map((f) => f.key).sort()).toEqual(["kas_jemaat", "kas_sarana_prasarana", "persembahan_bulanan"]);
    expect(warta!.kesaksian).toEqual([expect.objectContaining({ judul: `Kesaksian ${RUN}`, deskripsi: "Baris 1\nBaris 2" })]);
    // Litbang is whatever the active template held at creation: the same rows the admin sees.
    const { data: litbangRows } = await editor.supabase
      .from("warta_litbang_items")
      .select("id, name, deskripsi")
      .eq("warta_id", published.id)
      .order("sort_order");
    expect(warta!.litbang).toEqual(litbangRows);
  });

  it("returns the renungan's HTML as the literal text it was saved as", async () => {
    expect((await loadPublicWarta(published.slug))?.renunganIsi).toBe(SCRIPT_RENUNGAN);
  });
});

describe("§13 #5: the four figures", () => {
  it("equal the warta editor's finance tab and sarana_dana_report for the finance week", async () => {
    const week = financeWeek(SUNDAY);
    const publicFinance = (await loadPublicWarta(published.slug))!.finance;
    const editorFinance = await loadWartaFinance(editor.supabase, week);
    const { data: report } = await editor.supabase.rpc("sarana_dana_report", { p_start: week.start, p_end: week.end });

    const fromEditor = editorFinance.data!.map((i) => ({ key: i.key, name: i.name, ...i.report }));
    expect(publicFinance).toEqual(fromEditor);
    expect(publicFinance).toEqual(
      report!.map((r) => ({
        key: r.key,
        name: r.name,
        saldoAwal: r.saldo_awal,
        pemasukan: r.pemasukan,
        pengeluaran: r.pengeluaran,
        saldoAkhir: r.saldo_akhir,
      })),
    );

    // And they follow §9.7's formula for this run's rows.
    const kas = publicFinance.find((f) => f.key === "kas_jemaat")!;
    expect(kas.saldoAkhir).toBe(kas.saldoAwal + kas.pemasukan - kas.pengeluaran);
    expect(kas.pemasukan).toBeGreaterThanOrEqual(325_000);
    expect(kas.pengeluaran).toBeGreaterThanOrEqual(75_000);
  });
});

describe("drafts and unknown slugs", () => {
  it("load nothing, and a draft never shows in the list", async () => {
    expect(await loadPublicWarta(draft.slug)).toBeNull();
    expect(await loadPublicWarta(`tidak-ada-${RUN}`)).toBeNull();
    expect(await loadPublicWarta("../../jemaat")).toBeNull();
    expect(await loadPublicWarta("Huruf-Besar")).toBeNull();

    const list = await loadPublicWartaList();
    expect(list.error).toBeNull();
    const slugs = list.data!.map((w) => w.slug);
    expect(slugs).toContain(published.slug);
    expect(slugs).not.toContain(draft.slug);
    // Newest tanggal kebaktian first.
    const dates = list.data!.map((w) => w.tanggalKebaktian);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it("'Tarik ke Draft' removes the warta on the very next load, and publishing brings it back", async () => {
    expect(await loadPublicWarta(published.slug)).not.toBeNull();

    await setStatus(published.id, "draft");
    expect(await loadPublicWarta(published.slug)).toBeNull();
    expect((await loadPublicWartaList()).data!.some((w) => w.slug === published.slug)).toBe(false);
    const anon = createPublicClient();
    expect((await anon.rpc("public_warta_schedule", { p_slug: published.slug })).data).toEqual([]);
    expect((await anon.rpc("public_warta_finance", { p_slug: published.slug })).data).toEqual([]);

    await setStatus(published.id, "published");
    expect(await loadPublicWarta(published.slug)).not.toBeNull();
  });

  it("the latest-warta card only ever shows a published warta", async () => {
    const latest = await loadLatestPublicWarta();
    expect(latest.error).toBeNull();
    // This run's published warta is far in the future, so it's the newest; the later draft isn't.
    expect(latest.data?.slug).toBe(published.slug);
  });
});

describe("Jadwal Ibadah", () => {
  it("returns today through today + 6 in WIB, with names and no attendance or catatan", async () => {
    actAs(editor);
    const start = today();
    const created: string[] = [];
    for (const [offset, jam] of [[-1, "07:00"], [0, "07:00"], [6, "07:00"], [7, "07:00"]] as const) {
      const response = await call(peribadahan.POST, { method: "POST", body: { categoryKey: "doa_pagi", tanggal: addDays(start, offset), jam } });
      expect(response.status).toBe(201);
      const id = (response.body.data as unknown as { id: string }).id;
      created.push(id);
      createdScheduleItems.push(id);
    }
    await call(peribadahanItem.PATCH, {
      method: "PATCH",
      params: { id: created[1]! },
      body: { jam: "07:00", kehadiranLakiLaki: 9, catatan: `Internal ${RUN}` },
    });

    const result = await loadJadwalMendatang();
    expect(result.error).toBeNull();
    const mine = result.data!.filter((row) => created.includes(row.id));
    expect(mine.map((row) => row.id)).toEqual([created[1], created[2]]);
    expect(mine[0]).toMatchObject({ kehadiranLakiLaki: null, catatan: null, smkaKelompok: [] });
    expect(result.data!.every((row) => row.tanggal >= start && row.tanggal <= addDays(start, 6))).toBe(true);
  });
});
