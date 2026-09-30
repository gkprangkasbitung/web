/**
 * Pendeta (brief §14.7) against the local stack: permissions (401/403),
 * year-range validation, add/edit/delete with photo upload and removal,
 * deleting a pendeta used by Sambutan sets it null there, and anon's
 * column-limited, tampil-only REST read through `public_pendeta()`.
 */
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/types/database";

import { actAs, call, callForm, env, serviceClient, signIn, type Session } from "./harness";

const pendetaCollection = await import("@/app/api/admin/pendeta/route");
const pendetaItem = await import("@/app/api/admin/pendeta/[id]/route");
const sambutanRoute = await import("@/app/api/admin/profil-gereja/sambutan/route");

const RUN = `E2E ${Date.now().toString(36)}`;
const service = serviceClient();
const anon = createClient<Database>(env.url, env.anonKey, { auth: { persistSession: false } });

let editor: Session;
let viewer: Session;
let superadmin: Session;
const createdPendeta: string[] = [];

function jpeg(width = 40, height = 30, background = "#4a7a4a") {
  return sharp({ create: { width, height, channels: 3, background } }).jpeg();
}

function baseForm(overrides: Record<string, string> = {}) {
  const form = new FormData();
  form.append("nama", overrides.nama ?? `${RUN} Pdt. Satu`);
  form.append("peran", overrides.peran ?? "Pendeta Jemaat");
  form.append("tahunMulai", overrides.tahunMulai ?? "2019");
  form.append("tahunSelesai", overrides.tahunSelesai ?? "");
  form.append("keterangan", overrides.keterangan ?? "");
  form.append("tampil", overrides.tampil ?? "1");
  form.append("foto_alt", overrides.foto_alt ?? "");
  return form;
}

async function logRows(activity: string) {
  const { data, error } = await superadmin.supabase.from("activity_logs").select("module, activity").eq("activity", activity);
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

afterEach(async () => {
  // Undo any Sambutan pick a test made, so later tests (and other suites
  // reusing profil_gereja) start clean.
  await service.from("profil_gereja").update({ sambutan_pendeta_id: null }).eq("id", 1);
});

afterAll(async () => {
  for (const id of createdPendeta) await service.from("pendeta").delete().eq("id", id);
});

describe("Pendeta", () => {
  it("answers 401 without a session and 403 to a viewer, writing nothing", async () => {
    actAs(null);
    expect((await callForm(pendetaCollection.POST, { method: "POST", form: baseForm() })).status).toBe(401);

    actAs(viewer);
    expect((await callForm(pendetaCollection.POST, { method: "POST", form: baseForm() })).status).toBe(403);

    actAs(editor);
    const seeded = await callForm(pendetaCollection.POST, { method: "POST", form: baseForm({ nama: `${RUN} viewer target` }) });
    expect(seeded.status).toBe(201);
    const id = (seeded.body.data as unknown as { id: string }).id;
    createdPendeta.push(id);

    actAs(viewer);
    expect((await callForm(pendetaItem.PATCH, { method: "PATCH", form: baseForm(), params: { id } })).status).toBe(403);

    // Delete needs situs:delete, which editor doesn't have either.
    actAs(editor);
    expect((await call(pendetaItem.DELETE, { method: "DELETE", params: { id } })).status).toBe(403);
  });

  it("rejects a future tahunMulai, a future tahunSelesai, and tahunSelesai before tahunMulai", async () => {
    actAs(editor);
    const futureYear = String(new Date().getFullYear() + 5);

    const futureMulai = await callForm(pendetaCollection.POST, { method: "POST", form: baseForm({ tahunMulai: futureYear }) });
    expect(futureMulai.status).toBe(400);

    const futureSelesai = await callForm(pendetaCollection.POST, {
      method: "POST",
      form: baseForm({ tahunMulai: "2010", tahunSelesai: futureYear }),
    });
    expect(futureSelesai.status).toBe(400);

    const badRange = await callForm(pendetaCollection.POST, {
      method: "POST",
      form: baseForm({ tahunMulai: "2015", tahunSelesai: "2010" }),
    });
    expect(badRange.status).toBe(400);
  });

  it("adds with a photo, edits, and deletes (removing the photo from storage), logging each mutation once", async () => {
    actAs(editor);
    const form = baseForm({ nama: `${RUN} dengan foto` });
    form.append("foto_file", new File([await jpeg().toBuffer()], "foto.jpg", { type: "image/jpeg" }));
    form.set("foto_alt", "Foto pendeta");

    const add = await callForm(pendetaCollection.POST, { method: "POST", form });
    expect(add.status).toBe(201);
    const row = add.body.data as unknown as { id: string; foto_path: string | null; tahun_selesai: number | null };
    createdPendeta.push(row.id);
    expect(row.foto_path).toMatch(/^pendeta\//);
    expect(row.tahun_selesai).toBeNull();
    expect(await logRows(`Menambah pendeta "${RUN} dengan foto"`)).toHaveLength(1);

    const edit = await callForm(pendetaItem.PATCH, {
      method: "PATCH",
      form: baseForm({ nama: `${RUN} dengan foto (edit)`, foto_alt: "Foto pendeta" }),
      params: { id: row.id },
    });
    expect(edit.status).toBe(200);
    expect(await logRows(`Mengubah pendeta "${RUN} dengan foto" menjadi "${RUN} dengan foto (edit)"`)).toHaveLength(1);

    const { data: beforeDelete } = await service.storage.from("situs").list("pendeta", { limit: 1000 });
    const objectName = row.foto_path!.replace("pendeta/", "");
    expect((beforeDelete ?? []).some((item) => item.name === objectName)).toBe(true);

    actAs(superadmin);
    const remove = await call(pendetaItem.DELETE, { method: "DELETE", params: { id: row.id } });
    expect(remove.status).toBe(200);
    createdPendeta.splice(createdPendeta.indexOf(row.id), 1);

    const { data: afterDelete } = await service.storage.from("situs").list("pendeta", { limit: 1000 });
    expect((afterDelete ?? []).some((item) => item.name === objectName)).toBe(false);
  });

  it("deleting a pendeta used by Sambutan clears sambutan_pendeta_id, and the public profile still renders", async () => {
    actAs(editor);
    const add = await callForm(pendetaCollection.POST, { method: "POST", form: baseForm({ nama: `${RUN} sambutan` }) });
    expect(add.status).toBe(201);
    const id = (add.body.data as unknown as { id: string }).id;
    createdPendeta.push(id);

    // superadmin: situs:update (Sambutan's PATCH) and situs_rekening are both admin-only concerns;
    // situs:update alone is enough here (editor has it too), use superadmin to also cover the delete below.
    actAs(superadmin);
    const pick = await call(sambutanRoute.PATCH, { method: "PATCH", body: { sambutanTeks: "Selamat datang", pendetaId: id } });
    expect(pick.status).toBe(200);

    const remove = await call(pendetaItem.DELETE, { method: "DELETE", params: { id } });
    expect(remove.status).toBe(200);
    createdPendeta.splice(createdPendeta.indexOf(id), 1);

    const { data: profil, error } = await service.from("profil_gereja").select("sambutan_pendeta_id").eq("id", 1).single();
    expect(error).toBeNull();
    expect(profil?.sambutan_pendeta_id).toBeNull();

    const { data: publicProfil, error: publicError } = await anon.rpc("public_profil_gereja");
    expect(publicError).toBeNull();
    expect((publicProfil as Record<string, unknown>).sambutan_pendeta_nama).toBeNull();
  });

  it("a pendeta picked for Sambutan through the wrong id (23503) is rejected", async () => {
    actAs(superadmin);
    const bad = await call(sambutanRoute.PATCH, {
      method: "PATCH",
      body: { sambutanTeks: "x", pendetaId: "9f9f9f9f-9f9f-4f9f-8f9f-9f9f9f9f9f9f" },
    });
    expect(bad.status).toBe(400);
  });

  it("anon reads only tampil = true rows, only the public columns, through public_pendeta()", async () => {
    actAs(editor);
    const shown = await callForm(pendetaCollection.POST, { method: "POST", form: baseForm({ nama: `${RUN} tampil` }) });
    const hidden = await callForm(pendetaCollection.POST, { method: "POST", form: baseForm({ nama: `${RUN} tersembunyi` }) });
    const shownId = (shown.body.data as unknown as { id: string }).id;
    const hiddenId = (hidden.body.data as unknown as { id: string }).id;
    createdPendeta.push(shownId, hiddenId);

    await service.from("pendeta").update({ tampil: false }).eq("id", hiddenId);

    const { data, error } = await anon.rpc("public_pendeta");
    expect(error).toBeNull();
    const names = (data as { nama: string }[]).map((row) => row.nama);
    expect(names).toContain(`${RUN} tampil`);
    expect(names).not.toContain(`${RUN} tersembunyi`);

    const direct = await anon.from("pendeta").select("*");
    expect(direct.error?.code).toBe("42501");
  });
});
