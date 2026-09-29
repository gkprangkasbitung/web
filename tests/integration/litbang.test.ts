/**
 * Litbang template route handlers (brief §9.6, §10) against the local stack:
 * auth (401/403 including on reorder), add/edit/toggle/delete each logging
 * one activity row with the right sentence, and editing or deleting a card
 * already copied into a warta never touching that warta's own copy (§13 #3).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { actAs, call, CLIENT_IP, signIn, type Session } from "./harness";

const collection = await import("@/app/api/admin/litbang-template/route");
const item = await import("@/app/api/admin/litbang-template/[id]/route");
const reorder = await import("@/app/api/admin/litbang-template/reorder/route");

const MISSING_ID = "9f9f9f9f-9f9f-4f9f-8f9f-9f9f9f9f9f9f";
const RUN = `E2E ${Date.now().toString(36)}`;

let editor: Session;
let viewer: Session;
let superadmin: Session;
const createdCards: string[] = [];
const createdWarta: string[] = [];

async function logRows(activity: string) {
  const { data, error } = await superadmin.supabase
    .from("activity_logs")
    .select("module, activity, user_email, ip_address")
    .eq("activity", activity);
  if (error) throw error;
  return data;
}

beforeAll(async () => {
  [editor, viewer, superadmin] = await Promise.all([
    signIn("editor@gkp.test"),
    signIn("viewer@gkp.test"),
    signIn("superadmin@gkp.test"),
  ]);
});

afterAll(async () => {
  for (const id of createdWarta) await superadmin.supabase.from("warta").delete().eq("id", id);
  for (const id of createdCards) await superadmin.supabase.from("litbang_categories").delete().eq("id", id);
});

it("answers 401 to every request without a session, including reorder", async () => {
  actAs(null);
  expect((await call(collection.POST, { method: "POST", body: { name: "x" } })).status).toBe(401);
  expect((await call(item.PATCH, { method: "PATCH", body: { name: "x" }, params: { id: MISSING_ID } })).status).toBe(401);
  expect((await call(item.DELETE, { method: "DELETE", params: { id: MISSING_ID } })).status).toBe(401);
  expect((await call(reorder.POST, { method: "POST", body: { ids: [] } })).status).toBe(401);
});

it("answers 403 to a viewer's add, edit, delete, and reorder, writing nothing", async () => {
  actAs(editor);
  const seeded = await call(collection.POST, { method: "POST", body: { name: `${RUN} viewer target` } });
  expect(seeded.status).toBe(201);
  const id = (seeded.body.data as unknown as { id: string }).id;
  createdCards.push(id);

  actAs(viewer);
  for (const response of [
    await call(collection.POST, { method: "POST", body: { name: `${RUN} viewer add` } }),
    await call(item.PATCH, { method: "PATCH", body: { name: `${RUN} viewer edit` }, params: { id } }),
    await call(item.PATCH, { method: "PATCH", body: { active: false }, params: { id } }),
    await call(item.DELETE, { method: "DELETE", params: { id } }),
    await call(reorder.POST, { method: "POST", body: { ids: [id] } }),
  ]) {
    expect(response.status).toBe(403);
    expect(response.body.error).toBe("Kamu tidak punya akses untuk tindakan ini.");
  }

  const { data } = await superadmin.supabase.from("litbang_categories").select("name, active").eq("id", id).single();
  expect(data).toEqual({ name: `${RUN} viewer target`, active: true });
});

it("adds last, saves name/deskripsi, toggles active, and deletes, logging one row per mutation", async () => {
  actAs(editor);
  const name = `${RUN} satu`;

  const before = await superadmin.supabase.from("litbang_categories").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const maxBefore = before.data?.sort_order ?? -1;

  const add = await call(collection.POST, { method: "POST", body: { name: `  ${name}  `, deskripsi: "  Awal  " } });
  expect(add.status).toBe(201);
  const row = add.body.data as unknown as { id: string; name: string; deskripsi: string | null; active: boolean; sort_order: number };
  createdCards.push(row.id);
  expect(row).toMatchObject({ name, deskripsi: "Awal", active: true, sort_order: maxBefore + 1 });
  expect(await logRows(`Menambah litbang "${name}"`)).toEqual([
    { module: "litbang", activity: `Menambah litbang "${name}"`, user_email: "editor@gkp.test", ip_address: CLIENT_IP },
  ]);

  const renamed = `${name} diubah`;
  const editFields = await call(item.PATCH, {
    method: "PATCH",
    body: { name: renamed, deskripsi: "Baru" },
    params: { id: row.id },
  });
  expect(editFields.status).toBe(200);
  expect(await logRows(`Mengubah litbang "${name}" menjadi "${renamed}"`)).toHaveLength(1);

  const deactivate = await call(item.PATCH, { method: "PATCH", body: { active: false }, params: { id: row.id } });
  expect(deactivate.status).toBe(200);
  expect(await logRows(`Menonaktifkan litbang "${renamed}"`)).toHaveLength(1);

  const activate = await call(item.PATCH, { method: "PATCH", body: { active: true }, params: { id: row.id } });
  expect(activate.status).toBe(200);
  expect(await logRows(`Mengaktifkan litbang "${renamed}"`)).toHaveLength(1);

  const remove = await call(item.DELETE, { method: "DELETE", params: { id: row.id } });
  expect(remove.status).toBe(200);
  const removeLog = await logRows(`Menghapus litbang "${renamed}"`);
  expect(removeLog).toHaveLength(1);
  expect(removeLog[0]?.module).toBe("litbang");
  createdCards.splice(createdCards.indexOf(row.id), 1);
});

it("answers 400 for a blank name, and 404 for a missing or malformed id", async () => {
  actAs(editor);
  const blank = await call(collection.POST, { method: "POST", body: { name: "   " } });
  expect(blank.status).toBe(400);
  expect(blank.body.error).toMatch(/wajib diisi\.$/);

  for (const id of [MISSING_ID, "bukan-uuid"]) {
    expect((await call(item.PATCH, { method: "PATCH", body: { name: "x" }, params: { id } })).status).toBe(404);
    expect((await call(item.DELETE, { method: "DELETE", params: { id } })).status).toBe(404);
  }
});

it("reorders atomically, rejects a stale list, and logs one row", async () => {
  actAs(editor);
  const a = await call(collection.POST, { method: "POST", body: { name: `${RUN} reorder A` } });
  const b = await call(collection.POST, { method: "POST", body: { name: `${RUN} reorder B` } });
  const idA = (a.body.data as unknown as { id: string }).id;
  const idB = (b.body.data as unknown as { id: string }).id;
  createdCards.push(idA, idB);

  const { data: allIds } = await superadmin.supabase.from("litbang_categories").select("id");
  const fullOrder = (allIds as { id: string }[]).map((r) => r.id);

  const stale = await call(reorder.POST, { method: "POST", body: { ids: [idA, idB] } });
  expect(stale.status).toBe(400);
  expect(stale.body.error).toBe("Daftar Litbang sudah berubah. Muat ulang halaman lalu coba lagi.");

  const reversed = [...fullOrder].reverse();
  const ok = await call(reorder.POST, { method: "POST", body: { ids: reversed } });
  expect(ok.status).toBe(200);
  expect(await logRows("Mengubah urutan litbang")).not.toHaveLength(0);

  const { data: afterOrder } = await superadmin.supabase.from("litbang_categories").select("id, sort_order").order("sort_order");
  expect((afterOrder as { id: string }[]).map((r) => r.id)).toEqual(reversed);
});

it("editing or deleting a card already copied into a warta never touches that warta's own copy", async () => {
  actAs(editor);
  const cardName = `${RUN} snapshot`;
  const add = await call(collection.POST, { method: "POST", body: { name: cardName, deskripsi: "Isi asli" } });
  const cardId = (add.body.data as unknown as { id: string }).id;
  createdCards.push(cardId);

  // create_warta is the only way a card gets copied into a warta (0026 refuses direct inserts).
  const { data: wartaId, error: wartaError } = await editor.supabase.rpc("create_warta", {
    p_slug: `e2e-litbang-${Date.now()}`,
    p_tanggal_kebaktian: "2031-02-02",
    p_judul_kebaktian: "E2E",
  });
  expect(wartaError).toBeNull();
  createdWarta.push(wartaId!);

  const { data: snapshot, error: snapshotError } = await editor.supabase
    .from("warta_litbang_items")
    .select("id")
    .eq("warta_id", wartaId!)
    .eq("litbang_category_id", cardId)
    .single();
  expect(snapshotError).toBeNull();

  const edit = await call(item.PATCH, {
    method: "PATCH",
    body: { name: `${cardName} template diubah`, deskripsi: "Isi template baru" },
    params: { id: cardId },
  });
  expect(edit.status).toBe(200);

  let { data: unchanged } = await superadmin.supabase
    .from("warta_litbang_items")
    .select("name, deskripsi, litbang_category_id")
    .eq("id", snapshot!.id)
    .single();
  expect(unchanged).toEqual({ name: cardName, deskripsi: "Isi asli", litbang_category_id: cardId });

  const remove = await call(item.DELETE, { method: "DELETE", params: { id: cardId } });
  expect(remove.status).toBe(200);
  createdCards.splice(createdCards.indexOf(cardId), 1);

  ({ data: unchanged } = await superadmin.supabase
    .from("warta_litbang_items")
    .select("name, deskripsi, litbang_category_id")
    .eq("id", snapshot!.id)
    .single());
  expect(unchanged).toEqual({ name: cardName, deskripsi: "Isi asli", litbang_category_id: null });
});

describe("update validation", () => {
  it("requires at least one changed field", async () => {
    actAs(editor);
    const add = await call(collection.POST, { method: "POST", body: { name: `${RUN} kosong` } });
    const id = (add.body.data as unknown as { id: string }).id;
    createdCards.push(id);

    const response = await call(item.PATCH, { method: "PATCH", body: {}, params: { id } });
    expect(response.status).toBe(400);
  });
});
