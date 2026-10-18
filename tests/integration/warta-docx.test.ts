/**
 * Warta DOCX (brief §16.3) against the local stack: who may generate it,
 * preview vs. download (only a download is logged, exactly once), the
 * content hash and the 409 for a stale one, the Sarana & Dana figures
 * matching both the core report function and the public page's function,
 * and Persembahan Bulanan printing names only.
 */
import PizZip from "pizzip";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addDays, financeWeek, nextSunday } from "@/lib/dates";
import { formatAmount } from "@/lib/format";

import { actAs, createTestUser, env, serviceClient, signIn, type Session } from "./harness";

const route = await import("@/app/api/admin/warta/[id]/docx/route");
const { buildWartaViewModel } = await import("@/lib/warta-docx-view-model");

const MISSING_ID = "9f9f9f9f-9f9f-4f9f-8f9f-9f9f9f9f9f9f";
const RUN = Date.now().toString(36);
// A Sunday no other test file uses, unique to this run.
const SUNDAY = nextSunday(addDays("2045-01-01", Math.floor(Date.now() / 1000) % 40_000));
const FINANCE = financeWeek(SUNDAY);
const JUDUL = `DOCX ${RUN}`;
const STALE = "Data warta berubah sejak pratinjau dibuat. Muat ulang pratinjau.";
// Distinctive Persembahan Bulanan amounts that must never reach the document.
const PB_AMOUNTS = [7_314_159, 2_718_281];

const service = serviceClient();
let viewer: Session;
let superadmin: Session;
let noWartaRead: Session;
let noWartaReadUserId: string;
let wartaId: string;
let slug: string;
const createdRoles: string[] = [];
const createdJemaat: string[] = [];
const createdSchedule: string[] = [];
const createdTransactions: string[] = [];

async function get(id: string, query: string) {
  return route.GET(new Request(`http://localhost/api/admin/warta/${id}/docx?${query}`), {
    params: Promise.resolve({ id }),
  });
}

type Preview = { hash: string; dibuatPada: string; kelengkapan: { pesan: string; href: string }[]; docx: string };

async function preview(session: Session): Promise<Preview> {
  actAs(session);
  const response = await get(wartaId, "mode=preview");
  expect(response.status).toBe(200);
  const body = (await response.json()) as { data: Preview };
  expect(response.headers.get("X-Warta-Hash")).toBe(body.data.hash);
  return body.data;
}

function docxText(bytes: Uint8Array): string {
  const xml = new PizZip(bytes).file("word/document.xml")!.asText();
  return xml
    .split("</w:p>")
    .map((p) => [...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(""))
    .join("\n")
    .replace(/&amp;/g, "&");
}

async function downloadLogCount(): Promise<number> {
  const { count, error } = await superadmin.supabase
    .from("activity_logs")
    .select("id", { count: "exact", head: true })
    .eq("activity", `Mengunduh warta "${JUDUL}" (${SUNDAY})`);
  if (error) throw error;
  return count ?? 0;
}

async function logCountForRun(): Promise<number> {
  const { count, error } = await superadmin.supabase
    .from("activity_logs")
    .select("id", { count: "exact", head: true })
    .like("activity", `%${JUDUL}%`);
  if (error) throw error;
  return count ?? 0;
}

async function itemId(key: string): Promise<string> {
  const { data, error } = await service.from("sarana_dana_items").select("id").eq("key", key).single();
  if (error) throw error;
  return data.id;
}

async function categoryId(key: string): Promise<string> {
  const { data, error } = await service.from("peribadahan_categories").select("id").eq("key", key).single();
  if (error) throw error;
  return data.id;
}

async function addTransaction(row: { item_id: string; tanggal: string; tipe: string; jumlah: number; keterangan?: string; jemaat_id?: string }) {
  const { data, error } = await service.from("sarana_dana_transactions").insert(row).select("id").single();
  if (error) throw error;
  createdTransactions.push(data.id);
  return data.id;
}

beforeAll(async () => {
  [viewer, superadmin] = await Promise.all([signIn("viewer@gkp.test"), signIn("superadmin@gkp.test")]);

  // A staff role without warta:read.
  const role = await service.from("roles").insert({ name: `docx_uji_${RUN}` }).select("id").single();
  if (role.error) throw role.error;
  createdRoles.push(role.data.id);
  const perm = await service.from("permissions").select("id").eq("resource", "roles").eq("action", "read").single();
  if (perm.error) throw perm.error;
  await service.from("role_permissions").insert({ role_id: role.data.id, permission_id: perm.data.id });
  const email = `docx-${RUN}@test.local`;
  noWartaReadUserId = await createTestUser(email, "password123", []);
  await service.from("user_roles").insert({ user_id: noWartaReadUserId, role_id: role.data.id });
  noWartaRead = await signIn(email, "password123");

  const warta = await service
    .from("warta")
    .insert({ slug: `${SUNDAY}-docx-${RUN}`, tanggal_kebaktian: SUNDAY, judul_kebaktian: JUDUL, tema_kebaktian: "Tema awal" })
    .select("id, slug")
    .single();
  if (warta.error) throw warta.error;
  wartaId = warta.data.id;
  slug = warta.data.slug;

  const jemaat = await service.from("jemaat").insert({ nama: `Pemberi ${RUN}` }).select("id").single();
  if (jemaat.error) throw jemaat.error;
  createdJemaat.push(jemaat.data.id);

  const schedule = await service
    .from("peribadahan_items")
    .insert([
      { category_id: await categoryId("umum"), tanggal: SUNDAY, jam: "08:00", pelayan_firman_id: jemaat.data.id, sort_order: 0 },
      {
        category_id: await categoryId("umum"),
        tanggal: FINANCE.start,
        jam: "08:00",
        kehadiran_laki_laki: 11,
        kehadiran_perempuan: 12,
        kehadiran_anak: 3,
        kehadiran_online: 4,
        sort_order: 0,
      },
    ])
    .select("id");
  if (schedule.error) throw schedule.error;
  createdSchedule.push(...schedule.data.map((r) => r.id));

  const kas = await itemId("kas_jemaat");
  const pb = await itemId("persembahan_bulanan");
  await addTransaction({ item_id: kas, tanggal: FINANCE.start, tipe: "masuk", jumlah: 1_250_000, keterangan: `Kolekte ${RUN}` });
  await addTransaction({ item_id: kas, tanggal: addDays(FINANCE.start, 2), tipe: "keluar", jumlah: 300_000, keterangan: `Listrik ${RUN}` });
  await addTransaction({ item_id: pb, tanggal: FINANCE.start, tipe: "masuk", jumlah: PB_AMOUNTS[0]!, jemaat_id: jemaat.data.id });
  await addTransaction({ item_id: pb, tanggal: addDays(FINANCE.start, 1), tipe: "masuk", jumlah: PB_AMOUNTS[1]! });
});

afterAll(async () => {
  await service.from("warta").delete().eq("id", wartaId);
  for (const id of createdSchedule) await service.from("peribadahan_items").delete().eq("id", id);
  for (const id of createdTransactions) await service.from("sarana_dana_transactions").delete().eq("id", id);
  for (const id of createdJemaat) await service.from("jemaat").delete().eq("id", id);
  for (const id of createdRoles) await service.from("roles").delete().eq("id", id);
  await service.auth.admin.deleteUser(noWartaReadUserId);
});

describe("GET /api/admin/warta/[id]/docx", () => {
  it("answers 401 without a session and 403 without warta:read", async () => {
    actAs(null);
    expect((await get(wartaId, "mode=preview")).status).toBe(401);
    actAs(noWartaRead);
    const denied = await get(wartaId, "mode=preview");
    expect(denied.status).toBe(403);
    expect(denied.headers.get("Cache-Control")).toBe("no-store");
  });

  it("answers 404 for a missing or malformed warta id, and 400 for a bad mode", async () => {
    actAs(viewer);
    expect((await get(MISSING_ID, "mode=preview")).status).toBe(404);
    expect((await get("bukan-uuid", "mode=preview")).status).toBe(404);
    expect((await get(wartaId, "mode=apa")).status).toBe(400);
    expect((await get(wartaId, "mode=download")).status).toBe(400); // no hash
  });

  it("lets a viewer preview a draft (not logged) and download it (logged exactly once)", async () => {
    const logsBefore = await logCountForRun();
    const first = await preview(viewer);
    expect(first.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(docxText(Buffer.from(first.docx, "base64"))).toContain(JUDUL);
    expect(await logCountForRun()).toBe(logsBefore);

    const downloadsBefore = await downloadLogCount();
    actAs(viewer);
    const response = await get(wartaId, `mode=download&hash=${first.hash}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(response.headers.get("Content-Disposition")).toBe(`attachment; filename="warta-${SUNDAY}-DRAFT.docx"`);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Warta-Hash")).toBe(first.hash);
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(docxText(bytes)).toContain(JUDUL);
    expect(await downloadLogCount()).toBe(downloadsBefore + 1);

    const { data: logs } = await superadmin.supabase
      .from("activity_logs")
      .select("module, user_email")
      .eq("activity", `Mengunduh warta "${JUDUL}" (${SUNDAY})`)
      .order("created_at", { ascending: false })
      .limit(1);
    expect(logs?.[0]).toEqual({ module: "warta", user_email: "viewer@gkp.test" });
  });

  it("hashes the same data the same way, and differently once the warta, a schedule row, or a transaction changes", async () => {
    const base = (await preview(viewer)).hash;
    expect((await preview(viewer)).hash).toBe(base);

    await service.from("warta").update({ tema_kebaktian: `Tema baru ${RUN}` }).eq("id", wartaId);
    const afterWarta = (await preview(viewer)).hash;
    expect(afterWarta).not.toBe(base);

    await service.from("peribadahan_items").update({ jam: "09:00" }).eq("id", createdSchedule[0]!);
    const afterJadwal = (await preview(viewer)).hash;
    expect(afterJadwal).not.toBe(afterWarta);

    await service.from("sarana_dana_transactions").update({ keterangan: `Kolekte diubah ${RUN}` }).eq("id", createdTransactions[0]!);
    expect((await preview(viewer)).hash).not.toBe(afterJadwal);
  });

  it("refuses a stale hash with 409: no file, no activity log", async () => {
    const stale = (await preview(viewer)).hash;
    await service.from("warta").update({ tema_kebaktian: `Tema lagi ${RUN}` }).eq("id", wartaId);

    const downloadsBefore = await downloadLogCount();
    actAs(viewer);
    const response = await get(wartaId, `mode=download&hash=${stale}`);
    expect(response.status).toBe(409);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("Content-Disposition")).toBeNull();
    expect(await response.json()).toEqual({ error: STALE });
    expect(await downloadLogCount()).toBe(downloadsBefore);
  });

  it("prints the core report's Sarana & Dana figures, the same as the public page's", async () => {
    await service.from("warta").update({ status: "published", published_at: new Date().toISOString() }).eq("id", wartaId);

    const core = await viewer.supabase.rpc("sarana_dana_report", { p_start: FINANCE.start, p_end: FINANCE.end });
    if (core.error) throw core.error;
    const anon = (await import("@supabase/supabase-js")).createClient(env.url, env.anonKey, {
      auth: { persistSession: false },
    });
    const publik = await anon.rpc("public_warta_finance", { p_slug: slug });
    if (publik.error) throw publik.error;
    const coreKas = core.data.find((r) => r.key === "kas_jemaat")!;
    const publicKas = (publik.data as { key: string; saldo_awal: number; pemasukan: number; pengeluaran: number; saldo_akhir: number }[]).find(
      (r) => r.key === "kas_jemaat",
    )!;
    expect([publicKas.saldo_awal, publicKas.pemasukan, publicKas.pengeluaran, publicKas.saldo_akhir]).toEqual([
      coreKas.saldo_awal,
      coreKas.pemasukan,
      coreKas.pengeluaran,
      coreKas.saldo_akhir,
    ]);

    actAs(viewer);
    const built = await buildWartaViewModel(viewer.supabase, wartaId);
    const kas = built!.viewModel.sarana_dana.kas_jemaat;
    expect([kas.saldo_awal, kas.total_penerimaan, kas.total_pengeluaran, kas.saldo_akhir]).toEqual(
      [coreKas.saldo_awal, coreKas.pemasukan, coreKas.pengeluaran, coreKas.saldo_akhir].map(formatAmount),
    );

    const text = docxText(Buffer.from((await preview(viewer)).docx, "base64"));
    for (const figure of [kas.saldo_awal, kas.total_penerimaan, kas.total_pengeluaran, kas.saldo_akhir]) {
      expect(text).toContain(figure);
    }
    expect(text).toContain(`Kolekte diubah ${RUN}`);
  });

  it("lists Persembahan Bulanan by name only: no amounts, \"NN\" without a jemaat", async () => {
    const data = await preview(viewer);
    const text = docxText(Buffer.from(data.docx, "base64"));
    expect(text).toContain(`Pemberi ${RUN}`);
    expect(text).toContain("NN");
    for (const amount of PB_AMOUNTS) {
      expect(text).not.toContain(formatAmount(amount));
      expect(text).not.toContain(String(amount));
    }
  });

  it("hides empty Peribadahan sections and reports attendance from the week before", async () => {
    const data = await preview(viewer);
    const text = docxText(Buffer.from(data.docx, "base64"));
    expect(text).not.toContain("Pemahaman Alkitab,");
    expect(text).toContain("KEHADIRAN");
    expect(text).toContain("L : 11 orang, P : 12 orang, A : 3 orang");
    expect(text).toContain("Online : 4 orang");
    expect(data.kelengkapan).toContainEqual({ pesan: "Daftar Pujian masih kosong.", href: "#bahan-bacaan" });
  });

  it("never carries a hyperlink, and the database refuses a javascript: website", async () => {
    const data = await preview(viewer);
    const zip = new PizZip(Buffer.from(data.docx, "base64"));
    expect(zip.file("word/document.xml")!.asText()).not.toContain("<w:hyperlink");
    expect(zip.file("word/_rels/document.xml.rels")!.asText()).not.toContain("/hyperlink");
    const refused = await service.from("profil_gereja").update({ website_url: "javascript:alert(1)" }).eq("id", 1);
    expect(refused.error?.code).toBe("23514");
  });
});
