/**
 * Warta route handlers (brief §9.4, §10) against the local stack: auth,
 * who may create/edit/delete (§13 #2), the Litbang snapshot (§13 #3), the
 * shared schedule rows (§13 #4), the finance tab's figures matching the core
 * report function, slug uniqueness and immutability, optimistic concurrency,
 * what a delete leaves alone (§11), and one activity log row per mutation.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addDays, financeWeek, nextSunday, serviceWeek } from "@/lib/dates";
import { wartaSlug } from "@/lib/warta";

import { actAs, call, CLIENT_IP, signIn, type Session } from "./harness";

// Server-only modules load after the harness has mocked `server-only`.
const { loadPeribadahanCategoryOverview, loadPeribadahanOverview, loadPeribadahanRange } = await import(
  "@/lib/peribadahan-routes"
);
const { loadWartaFinance } = await import("@/lib/sarana-dana-routes");
const collection = await import("@/app/api/admin/warta/route");
const item = await import("@/app/api/admin/warta/[id]/route");
const litbang = await import("@/app/api/admin/warta/[id]/litbang/[itemId]/route");
const kesaksian = await import("@/app/api/admin/warta/[id]/kesaksian/route");
const kesaksianItem = await import("@/app/api/admin/warta/[id]/kesaksian/[itemId]/route");
const peribadahan = await import("@/app/api/admin/peribadahan/route");
const peribadahanItem = await import("@/app/api/admin/peribadahan/[id]/route");
const transactions = await import("@/app/api/admin/sarana-dana/[id]/transactions/route");

const MISSING_ID = "9f9f9f9f-9f9f-4f9f-8f9f-9f9f9f9f9f9f";
// activity_logs is append-only: the judul and the dates are unique to this run,
// so an exact activity sentence can't already exist from an earlier run.
const RUN = Date.now().toString(36);
const SUNDAY = nextSunday(addDays("2033-01-01", Math.floor(Date.now() / 1000) % 50_000));

let editor: Session;
let viewer: Session;
let admin: Session;
let superadmin: Session;
const createdWarta: string[] = [];
const createdTemplateCards: string[] = [];
const createdScheduleItems: string[] = [];
const createdTransactions: string[] = [];

type WartaCreated = { id: string; slug: string };

async function logRows(activity: string) {
  const { data, error } = await superadmin.supabase
    .from("activity_logs")
    .select("module, activity, user_email, ip_address")
    .eq("activity", activity);
  if (error) throw error;
  return data;
}

async function createWarta(session: Session, body: Record<string, unknown>): Promise<WartaCreated> {
  actAs(session);
  const response = await call(collection.POST, { method: "POST", body });
  expect(response.status).toBe(201);
  const created = response.body.data as unknown as WartaCreated;
  createdWarta.push(created.id);
  return created;
}

async function readWarta(id: string) {
  const { data, error } = await superadmin.supabase.from("warta").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

beforeAll(async () => {
  [editor, viewer, admin, superadmin] = await Promise.all([
    signIn("editor@gkp.test"),
    signIn("viewer@gkp.test"),
    signIn("admin@gkp.test"),
    signIn("superadmin@gkp.test"),
  ]);
});

afterAll(async () => {
  for (const id of createdWarta) await superadmin.supabase.from("warta").delete().eq("id", id);
  for (const id of createdScheduleItems) await superadmin.supabase.from("peribadahan_items").delete().eq("id", id);
  for (const id of createdTransactions) await superadmin.supabase.from("sarana_dana_transactions").delete().eq("id", id);
  for (const id of createdTemplateCards) await superadmin.supabase.from("litbang_categories").delete().eq("id", id);
});

describe("auth", () => {
  it("answers 401 to every route without a session", async () => {
    actAs(null);
    const params = { id: MISSING_ID, itemId: MISSING_ID };
    for (const response of [
      await call(collection.POST, { method: "POST", body: {} }),
      await call(item.PATCH, { method: "PATCH", body: { status: "published" }, params }),
      await call(item.DELETE, { method: "DELETE", params }),
      await call(litbang.PATCH, { method: "PATCH", body: { deskripsi: "x" }, params }),
      await call(kesaksian.POST, { method: "POST", body: { judul: "x" }, params }),
      await call(kesaksianItem.PATCH, { method: "PATCH", body: { judul: "x" }, params }),
      await call(kesaksianItem.DELETE, { method: "DELETE", params }),
    ]) {
      expect(response.status).toBe(401);
    }
  });

  it("answers 403 to every viewer write, with nothing written", async () => {
    const warta = await createWarta(editor, { tanggalKebaktian: SUNDAY, judulKebaktian: `E2E ${RUN} viewer` });
    const before = await readWarta(warta.id);
    const { data: card } = await superadmin.supabase
      .from("warta_litbang_items")
      .select("id")
      .eq("warta_id", warta.id)
      .limit(1)
      .maybeSingle();
    const params = { id: warta.id, itemId: card?.id ?? MISSING_ID };

    actAs(viewer);
    for (const response of [
      await call(collection.POST, { method: "POST", body: { tanggalKebaktian: SUNDAY, judulKebaktian: "Viewer" } }),
      await call(item.PATCH, { method: "PATCH", body: { status: "published" }, params }),
      await call(item.DELETE, { method: "DELETE", params }),
      await call(litbang.PATCH, { method: "PATCH", body: { deskripsi: "Viewer" }, params }),
      await call(kesaksian.POST, { method: "POST", body: { judul: "Viewer" }, params }),
    ]) {
      expect(response.status).toBe(403);
      expect(response.body.error).toBe("Kamu tidak punya akses untuk tindakan ini.");
    }
    expect(await readWarta(warta.id)).toEqual(before);
  });
});

describe("§13 #2: editor creates and edits but can't delete; admin can", () => {
  it("runs the whole lifecycle with the right permissions and one log row per mutation", async () => {
    const judul = `E2E ${RUN} siklus`;
    const tanggal = addDays(SUNDAY, 7);
    const label = `"${judul}" (${tanggal})`;

    // create_by from the session, never from the body; status always draft.
    const warta = await createWarta(editor, {
      tanggalKebaktian: tanggal,
      judulKebaktian: judul,
      temaKebaktian: "  Tema awal  ",
      createdBy: MISSING_ID,
      status: "published",
    });
    expect(warta.slug).toBe(wartaSlug(tanggal, judul));
    const created = await readWarta(warta.id);
    const { data: editorProfile } = await editor.supabase.auth.getUser();
    expect(created).toMatchObject({
      status: "draft",
      created_by: editorProfile.user!.id,
      published_at: null,
      tema_kebaktian: "Tema awal",
    });
    expect(await logRows(`Membuat warta ${label}`)).toEqual([
      { module: "warta", activity: `Membuat warta ${label}`, user_email: "editor@gkp.test", ip_address: CLIENT_IP },
    ]);

    actAs(editor);
    const edit = await call(item.PATCH, {
      method: "PATCH",
      params: { id: warta.id },
      body: {
        tanggalKebaktian: tanggal,
        judulKebaktian: judul,
        renunganIsi: "Baris satu\nBaris dua",
        expectedUpdatedAt: created!.updated_at,
        slug: "slug-dari-client",
      },
    });
    expect(edit.status).toBe(200);
    expect(await logRows(`Mengubah warta ${label}`)).toHaveLength(1);

    // published_at comes from the database, not from the client.
    const publish = await call(item.PATCH, {
      method: "PATCH",
      params: { id: warta.id },
      body: { status: "published", publishedAt: "2000-01-01T00:00:00Z" },
    });
    expect(publish.status).toBe(200);
    const published = await readWarta(warta.id);
    expect(published?.status).toBe("published");
    expect(Math.abs(new Date(published!.published_at!).getTime() - Date.now())).toBeLessThan(60_000);
    expect(published?.slug).toBe(warta.slug);
    expect(published?.tema_kebaktian).toBeNull();
    expect(published?.renungan_isi).toBe("Baris satu\nBaris dua");
    expect(await logRows(`Mempublikasikan warta ${label}`)).toHaveLength(1);

    const unpublish = await call(item.PATCH, { method: "PATCH", params: { id: warta.id }, body: { status: "draft" } });
    expect(unpublish.status).toBe(200);
    expect((await readWarta(warta.id))?.published_at).toBeNull();
    expect(await logRows(`Menarik warta ${label} ke draft`)).toHaveLength(1);

    const editorDelete = await call(item.DELETE, { method: "DELETE", params: { id: warta.id } });
    expect(editorDelete.status).toBe(403);
    expect(await readWarta(warta.id)).not.toBeNull();

    actAs(admin);
    const adminDelete = await call(item.DELETE, { method: "DELETE", params: { id: warta.id } });
    expect(adminDelete.status).toBe(200);
    expect(await readWarta(warta.id)).toBeNull();
    expect(await logRows(`Menghapus warta ${label}`)).toEqual([
      { module: "warta", activity: `Menghapus warta ${label}`, user_email: "admin@gkp.test", ip_address: CLIENT_IP },
    ]);
    createdWarta.splice(createdWarta.indexOf(warta.id), 1);
  });

  it("validates the body and answers 404 for a missing or malformed id", async () => {
    actAs(editor);
    const blank = await call(collection.POST, { method: "POST", body: { tanggalKebaktian: SUNDAY, judulKebaktian: "  " } });
    expect(blank.status).toBe(400);
    expect(blank.body.error).toBe("Judul Kebaktian wajib diisi.");

    const badDate = await call(collection.POST, { method: "POST", body: { tanggalKebaktian: "2033-02-30", judulKebaktian: "x" } });
    expect(badDate.status).toBe(400);

    const badStatus = await call(item.PATCH, { method: "PATCH", params: { id: MISSING_ID }, body: { status: "arsip" } });
    expect(badStatus.status).toBe(400);

    for (const id of [MISSING_ID, "bukan-uuid"]) {
      expect((await call(item.PATCH, { method: "PATCH", params: { id }, body: { status: "draft" } })).status).toBe(404);
      actAs(admin);
      expect((await call(item.DELETE, { method: "DELETE", params: { id } })).status).toBe(404);
      actAs(editor);
    }
  });
});

describe("slug", () => {
  it("a second warta with the same tanggal + judul gets a 4-character suffix", async () => {
    const tanggal = addDays(SUNDAY, 14);
    const judul = `E2E ${RUN} Minggu Adven`;
    const base = wartaSlug(tanggal, judul);

    const first = await createWarta(editor, { tanggalKebaktian: tanggal, judulKebaktian: judul });
    const second = await createWarta(editor, { tanggalKebaktian: tanggal, judulKebaktian: judul });
    expect(first.slug).toBe(base);
    expect(second.slug).toMatch(new RegExp(`^${base}-[0-9a-z]{4}$`));
  });

  it("a direct REST update of the slug is refused, even for super_admin", async () => {
    const warta = await createWarta(editor, { tanggalKebaktian: addDays(SUNDAY, 21), judulKebaktian: `E2E ${RUN} slug` });
    const { error } = await superadmin.supabase.from("warta").update({ slug: "slug-baru" }).eq("id", warta.id);
    expect(error?.code).toBe("22023");
    expect((await readWarta(warta.id))?.slug).toBe(warta.slug);
  });
});

describe("optimistic concurrency (Informasi & Renungan)", () => {
  it("refuses a save based on an outdated updated_at, writing nothing", async () => {
    const tanggal = addDays(SUNDAY, 28);
    const judul = `E2E ${RUN} konflik`;
    const warta = await createWarta(editor, { tanggalKebaktian: tanggal, judulKebaktian: judul });
    const loaded = await readWarta(warta.id);

    actAs(editor);
    const first = await call(item.PATCH, {
      method: "PATCH",
      params: { id: warta.id },
      body: { tanggalKebaktian: tanggal, judulKebaktian: judul, temaKebaktian: "Versi A", expectedUpdatedAt: loaded!.updated_at },
    });
    expect(first.status).toBe(200);

    actAs(admin);
    const stale = await call(item.PATCH, {
      method: "PATCH",
      params: { id: warta.id },
      body: { tanggalKebaktian: tanggal, judulKebaktian: judul, temaKebaktian: "Versi B", expectedUpdatedAt: loaded!.updated_at },
    });
    expect(stale.status).toBe(400);
    expect(stale.body.error).toMatch(/sudah diubah orang lain/);
    expect((await readWarta(warta.id))?.tema_kebaktian).toBe("Versi A");

    // A status change doesn't count as a content edit, so it can't cause a false conflict.
    const afterFirst = (first.body.data as unknown as { updatedAt: string }).updatedAt;
    actAs(editor);
    expect((await call(item.PATCH, { method: "PATCH", params: { id: warta.id }, body: { status: "published" } })).status).toBe(200);
    const again = await call(item.PATCH, {
      method: "PATCH",
      params: { id: warta.id },
      body: { tanggalKebaktian: tanggal, judulKebaktian: judul, temaKebaktian: "Versi C", expectedUpdatedAt: afterFirst },
    });
    expect(again.status).toBe(200);
  });

  it("answers 404, not a conflict, for a warta that doesn't exist", async () => {
    actAs(editor);
    const response = await call(item.PATCH, {
      method: "PATCH",
      params: { id: MISSING_ID },
      body: { tanggalKebaktian: SUNDAY, judulKebaktian: "x", expectedUpdatedAt: "2030-01-01T00:00:00+00:00" },
    });
    expect(response.status).toBe(404);
  });
});

describe("§13 #3: the Litbang snapshot", () => {
  it("copies only active cards; editing one warta's copy changes neither the template nor another warta", async () => {
    const { data: cards, error } = await superadmin.supabase
      .from("litbang_categories")
      .insert([
        { name: `E2E ${RUN} aktif`, deskripsi: "Template", active: true, sort_order: 9000 },
        { name: `E2E ${RUN} nonaktif`, deskripsi: "Template", active: false, sort_order: 9001 },
      ])
      .select("id, name");
    expect(error).toBeNull();
    createdTemplateCards.push(...cards!.map((c) => c.id));
    const [active, inactive] = cards!;

    const a = await createWarta(editor, { tanggalKebaktian: addDays(SUNDAY, 35), judulKebaktian: `E2E ${RUN} litbang A` });
    const b = await createWarta(editor, { tanggalKebaktian: addDays(SUNDAY, 42), judulKebaktian: `E2E ${RUN} litbang B` });

    const copies = async (wartaId: string) =>
      (
        await superadmin.supabase
          .from("warta_litbang_items")
          .select("id, name, deskripsi, litbang_category_id")
          .eq("warta_id", wartaId)
          .like("name", `E2E ${RUN}%`)
      ).data!;
    const copiesA = await copies(a.id);
    expect(copiesA).toEqual([expect.objectContaining({ name: active!.name, deskripsi: "Template", litbang_category_id: active!.id })]);
    expect(copiesA.some((c) => c.litbang_category_id === inactive!.id)).toBe(false);

    actAs(editor);
    const edit = await call(litbang.PATCH, {
      method: "PATCH",
      params: { id: a.id, itemId: copiesA[0]!.id },
      body: { deskripsi: "Khusus warta A", name: "Nama dari client" },
    });
    expect(edit.status).toBe(200);
    expect(edit.body.data).toMatchObject({ name: active!.name, deskripsi: "Khusus warta A" });
    expect(await logRows(`Mengubah litbang "${active!.name}" pada warta "E2E ${RUN} litbang A" (${addDays(SUNDAY, 35)})`)).toHaveLength(1);

    const { data: template } = await superadmin.supabase.from("litbang_categories").select("deskripsi").eq("id", active!.id).single();
    expect(template?.deskripsi).toBe("Template");
    expect((await copies(b.id))[0]).toMatchObject({ deskripsi: "Template" });

    // Addressed under the wrong warta: 404, nothing written.
    const wrongWarta = await call(litbang.PATCH, {
      method: "PATCH",
      params: { id: b.id, itemId: copiesA[0]!.id },
      body: { deskripsi: "Salah alamat" },
    });
    expect(wrongWarta.status).toBe(404);
    expect((await copies(a.id))[0]?.deskripsi).toBe("Khusus warta A");
  });
});

describe("Kesaksian", () => {
  it("adds last, edits, and deletes, logging one row each", async () => {
    const tanggal = addDays(SUNDAY, 49);
    const warta = await createWarta(editor, { tanggalKebaktian: tanggal, judulKebaktian: `E2E ${RUN} kesaksian` });
    const label = `"E2E ${RUN} kesaksian" (${tanggal})`;

    actAs(editor);
    const first = await call(kesaksian.POST, { method: "POST", params: { id: warta.id }, body: { judul: "Pertama" } });
    const second = await call(kesaksian.POST, { method: "POST", params: { id: warta.id }, body: { judul: "Kedua", deskripsi: "Isi" } });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const firstId = (first.body.data as unknown as { id: string }).id;
    const secondId = (second.body.data as unknown as { id: string }).id;

    const { data: order } = await superadmin.supabase
      .from("warta_kesaksian_items")
      .select("id")
      .eq("warta_id", warta.id)
      .order("sort_order");
    expect(order!.map((r) => r.id)).toEqual([firstId, secondId]);
    expect(await logRows(`Menambah kesaksian "Kedua" pada warta ${label}`)).toHaveLength(1);

    const blank = await call(kesaksianItem.PATCH, { method: "PATCH", params: { id: warta.id, itemId: firstId }, body: { judul: " " } });
    expect(blank.status).toBe(400);

    const edit = await call(kesaksianItem.PATCH, {
      method: "PATCH",
      params: { id: warta.id, itemId: firstId },
      body: { judul: "Pertama diubah", deskripsi: "" },
    });
    expect(edit.status).toBe(200);
    expect(edit.body.data).toMatchObject({ judul: "Pertama diubah", deskripsi: null });
    expect(await logRows(`Mengubah kesaksian "Pertama diubah" pada warta ${label}`)).toHaveLength(1);

    const remove = await call(kesaksianItem.DELETE, { method: "DELETE", params: { id: warta.id, itemId: secondId } });
    expect(remove.status).toBe(200);
    expect(await logRows(`Menghapus kesaksian "Kedua" dari warta ${label}`)).toHaveLength(1);

    const missing = await call(kesaksianItem.DELETE, { method: "DELETE", params: { id: warta.id, itemId: secondId } });
    expect(missing.status).toBe(404);
  });
});

describe("§13 #4: a warta's Bidang Peribadahan is the Peribadahan module's own rows", () => {
  it("a row added from the warta shows on /admin/peribadahan and its category page, and edits there show in the warta", async () => {
    const tanggal = addDays(SUNDAY, 56);
    const week = serviceWeek(tanggal);
    await createWarta(editor, { tanggalKebaktian: tanggal, judulKebaktian: `E2E ${RUN} jadwal` });

    // "Tambah Jadwal" inside the warta: any date in the service week, here the Wednesday.
    actAs(editor);
    const added = await call(peribadahan.POST, {
      method: "POST",
      body: { categoryKey: "pa", tanggal: addDays(tanggal, 3), jam: "19:00" },
    });
    expect(added.status).toBe(201);
    const id = (added.body.data as unknown as { id: string }).id;
    createdScheduleItems.push(id);

    const overview = await loadPeribadahanOverview(editor.supabase, "");
    expect(overview.data!.rows.some((row) => row.id === id)).toBe(true);
    const category = await loadPeribadahanCategoryOverview(editor.supabase, "pa");
    expect(category.data!.rows.some((row) => row.id === id)).toBe(true);

    // The reverse: an edit made from the Peribadahan module shows in the warta's section.
    const edit = await call(peribadahanItem.PATCH, { method: "PATCH", params: { id }, body: { tema: `Tema ${RUN}` } });
    expect(edit.status).toBe(200);
    const inWarta = await loadPeribadahanRange(editor.supabase, week);
    expect(inWarta.data!.rows.find((row) => row.id === id)?.tema).toBe(`Tema ${RUN}`);

    // Rows outside the service week don't show in this warta.
    const outside = await call(peribadahan.POST, { method: "POST", body: { categoryKey: "umum", tanggal: addDays(tanggal, 7) } });
    const outsideId = (outside.body.data as unknown as { id: string }).id;
    createdScheduleItems.push(outsideId);
    const again = await loadPeribadahanRange(editor.supabase, week);
    expect(again.data!.rows.some((row) => row.id === outsideId)).toBe(false);
    expect(again.data!.rows.every((row) => row.tanggal >= week.start && row.tanggal <= week.end)).toBe(true);
  });
});

describe("Bidang Sarana dan Dana", () => {
  it("the four figures are exactly the core report function's; the tab holds that item's transactions in range", async () => {
    const tanggal = addDays(SUNDAY, 63);
    const week = financeWeek(tanggal);
    await createWarta(editor, { tanggalKebaktian: tanggal, judulKebaktian: `E2E ${RUN} keuangan` });

    const { data: kas } = await superadmin.supabase.from("sarana_dana_items").select("id").eq("key", "kas_jemaat").single();
    actAs(editor);
    for (const body of [
      { tanggal: addDays(week.start, 1), tipe: "masuk", jumlah: 700_000 },
      { tanggal: week.end, tipe: "keluar", jumlah: 150_000 },
      { tanggal: addDays(week.start, -1), tipe: "masuk", jumlah: 90_000 },
      { tanggal: tanggal, tipe: "masuk", jumlah: 55_000 },
    ]) {
      const response = await call(transactions.POST, { method: "POST", params: { id: kas!.id }, body });
      expect(response.status).toBe(201);
      createdTransactions.push((response.body.data as unknown as { id: string }).id);
    }

    const finance = await loadWartaFinance(editor.supabase, week);
    const { data: report } = await editor.supabase.rpc("sarana_dana_report", { p_start: week.start, p_end: week.end });
    expect(finance.data!.map((i) => ({ key: i.key, ...i.report }))).toEqual(
      report!.map((r) => ({
        key: r.key,
        saldoAwal: r.saldo_awal,
        pemasukan: r.pemasukan,
        pengeluaran: r.pengeluaran,
        saldoAkhir: r.saldo_akhir,
      })),
    );

    const kasTab = finance.data!.find((i) => i.key === "kas_jemaat")!;
    const mine = kasTab.rows.filter((row) => createdTransactions.includes(row.id));
    expect(mine.map((row) => row.jumlah).sort()).toEqual([150_000, 700_000]);
    expect(kasTab.rows.every((row) => row.itemId === kas!.id && row.tanggal >= week.start && row.tanggal <= week.end)).toBe(true);
    for (const other of finance.data!.filter((i) => i.key !== "kas_jemaat")) {
      expect(other.rows.some((row) => createdTransactions.includes(row.id))).toBe(false);
    }
  });
});

describe("§11: deleting a warta", () => {
  it("removes only its own Litbang and Kesaksian; schedule rows and transactions stay", async () => {
    const tanggal = addDays(SUNDAY, 70);
    const warta = await createWarta(editor, { tanggalKebaktian: tanggal, judulKebaktian: `E2E ${RUN} hapus` });

    actAs(editor);
    await call(kesaksian.POST, { method: "POST", params: { id: warta.id }, body: { judul: "Ikut terhapus" } });
    const jadwal = await call(peribadahan.POST, { method: "POST", body: { categoryKey: "umum", tanggal } });
    const jadwalId = (jadwal.body.data as unknown as { id: string }).id;
    createdScheduleItems.push(jadwalId);
    const { data: kas } = await superadmin.supabase.from("sarana_dana_items").select("id").eq("key", "kas_jemaat").single();
    const trx = await call(transactions.POST, {
      method: "POST",
      params: { id: kas!.id },
      body: { tanggal: addDays(tanggal, -3), tipe: "masuk", jumlah: 12_000 },
    });
    const trxId = (trx.body.data as unknown as { id: string }).id;
    createdTransactions.push(trxId);

    actAs(admin);
    expect((await call(item.DELETE, { method: "DELETE", params: { id: warta.id } })).status).toBe(200);
    createdWarta.splice(createdWarta.indexOf(warta.id), 1);

    const count = async (table: "warta_litbang_items" | "warta_kesaksian_items") =>
      (await superadmin.supabase.from(table).select("id", { count: "exact", head: true }).eq("warta_id", warta.id)).count;
    expect(await count("warta_litbang_items")).toBe(0);
    expect(await count("warta_kesaksian_items")).toBe(0);
    expect((await superadmin.supabase.from("peribadahan_items").select("id").eq("id", jadwalId).maybeSingle()).data).not.toBeNull();
    expect((await superadmin.supabase.from("sarana_dana_transactions").select("id").eq("id", trxId).maybeSingle()).data).not.toBeNull();
  });
});
