/**
 * Profil Gereja and site photo uploads (brief §14.1, §14.5) against the
 * local stack: permissions (401/403, editor vs. situs_rekening), the upload
 * pipeline (magic bytes, SVG, size, EXIF/GPS, appended payloads), storage
 * cleanup on replace/remove and on a failed database write, the orphan
 * sweep, direct REST and storage writes refused, and anon's column-limited
 * public read.
 */
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { ServerSupabase } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

import { actAs, call, callForm, CLIENT_IP, env, serviceClient, signIn, type Session } from "./harness";

const beranda = await import("@/app/api/admin/profil-gereja/beranda/route");
const tentang = await import("@/app/api/admin/profil-gereja/tentang/route");
const kontak = await import("@/app/api/admin/profil-gereja/kontak/route");
const sosialMedia = await import("@/app/api/admin/profil-gereja/sosial-media/route");
const persembahan = await import("@/app/api/admin/profil-gereja/persembahan/route");
const linimasa = await import("@/app/api/admin/profil-gereja/linimasa/route");
const linimasaItem = await import("@/app/api/admin/profil-gereja/linimasa/[id]/route");
const linimasaReorder = await import("@/app/api/admin/profil-gereja/linimasa/reorder/route");
const { sweepSitusOrphans } = await import("@/lib/situs-photos");
const { revalidatePath } = await import("next/cache");

const RUN = `E2E ${Date.now().toString(36)}`;
const service = serviceClient();
const storage = service.storage.from("situs");
const anon = createClient<Database>(env.url, env.anonKey, { auth: { persistSession: false } });

let editor: Session;
let viewer: Session;
let admin: Session;
let superadmin: Session;
const createdLinimasa: string[] = [];

async function objectPaths(): Promise<string[]> {
  const { data, error } = await storage.list("profil", { limit: 1000 });
  if (error) throw error;
  return data.filter((item) => item.id).map((item) => `profil/${item.name}`);
}

async function profil() {
  const { data, error } = await service.from("profil_gereja").select("*").eq("id", 1).single();
  if (error) throw error;
  return data;
}

async function logCount(activity: string): Promise<number> {
  const { count, error } = await superadmin.supabase
    .from("activity_logs")
    .select("id", { count: "exact", head: true })
    .eq("activity", activity)
    .eq("ip_address", CLIENT_IP);
  if (error) throw error;
  return count ?? 0;
}

async function latestLog(module = "situs") {
  const { data, error } = await superadmin.supabase
    .from("activity_logs")
    .select("module, activity, user_email, ip_address")
    .eq("module", module)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (error) throw error;
  return data;
}

function jpeg(width = 64, height = 48, background = "#c87828") {
  return sharp({ create: { width, height, channels: 3, background } }).jpeg();
}

async function jpegWithGps(): Promise<Buffer> {
  return jpeg()
    .withExif({
      IFD0: { Make: "UjiKamera" },
      IFD3: { GPSLatitudeRef: "S", GPSLatitude: "6/1 21/1 3000/100", GPSLongitudeRef: "E", GPSLongitude: "106/1 15/1 0/1" },
    })
    .toBuffer();
}

function berandaForm(fields: { file?: Buffer | Uint8Array; fileName?: string; type?: string; alt?: string; hapus?: boolean; judul?: string }) {
  const form = new FormData();
  form.append("heroJudul", fields.judul ?? `${RUN} judul`);
  form.append("heroSubjudul", "");
  if (fields.file) {
    form.append("foto_file", new File([new Uint8Array(fields.file)], fields.fileName ?? "foto.jpg", { type: fields.type ?? "image/jpeg" }));
  }
  form.append("foto_alt", fields.alt ?? "");
  if (fields.hapus) form.append("foto_hapus", "1");
  return form;
}

async function resetProfil() {
  const reset = await service
    .from("profil_gereja")
    .update({
      hero_judul: null, hero_subjudul: null, hero_foto_path: null, hero_foto_alt: null,
      sambutan_teks: null, sambutan_pendeta_id: null,
      sejarah: null, visi: null, misi: [], sejarah_foto_path: null, sejarah_foto_alt: null,
      alamat: null, telepon: null, email: null, jam_sekretariat: null, maps_url: null,
      instagram_url: null, youtube_url: null, facebook_url: null,
    })
    .eq("id", 1);
  if (reset.error) throw reset.error;
  const rekening = await service
    .from("profil_gereja_rekening")
    .update({ nama_bank: null, nomor_rekening: null, atas_nama: null, qris_foto_path: null, qris_foto_alt: null })
    .eq("id", 1);
  if (rekening.error) throw rekening.error;
}

beforeAll(async () => {
  [editor, viewer, admin, superadmin] = await Promise.all([
    signIn("editor@gkp.test"),
    signIn("viewer@gkp.test"),
    signIn("admin@gkp.test"),
    signIn("superadmin@gkp.test"),
  ]);
  await resetProfil();
});

afterAll(async () => {
  await resetProfil();
  for (const id of createdLinimasa) await service.from("profil_gereja_linimasa").delete().eq("id", id);
  // Nothing refers to any object any more: remove what this run uploaded.
  const leftovers = await objectPaths();
  if (leftovers.length > 0) await storage.remove(leftovers);
});

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("permissions", () => {
  it("answers 401 without a session, writing nothing", async () => {
    actAs(null);
    expect((await callForm(beranda.PATCH, { method: "PATCH", form: berandaForm({}) })).status).toBe(401);
    expect((await call(kontak.PATCH, { method: "PATCH", body: {} })).status).toBe(401);
    expect((await callForm(persembahan.PATCH, { method: "PATCH", form: new FormData() })).status).toBe(401);
  });

  it("answers 403 to every viewer write (situs:read only), writing nothing", async () => {
    actAs(viewer);
    const image = await jpeg().toBuffer();
    const before = await objectPaths();
    for (const response of [
      await callForm(beranda.PATCH, { method: "PATCH", form: berandaForm({ file: image, alt: "Uji", judul: "Viewer" }) }),
      await call(kontak.PATCH, { method: "PATCH", body: { alamat: "Viewer" } }),
      await call(sosialMedia.PATCH, { method: "PATCH", body: {} }),
      await callForm(persembahan.PATCH, { method: "PATCH", form: new FormData() }),
      await call(linimasa.POST, { method: "POST", body: { tahun: "2000", teks: "Viewer" } }),
      await call(linimasaReorder.POST, { method: "POST", body: { ids: [] } }),
    ]) {
      expect(response.status).toBe(403);
    }
    expect((await profil()).hero_judul).toBeNull();
    expect(await objectPaths()).toEqual(before);
  });
});

describe("photo uploads (brief §14.5)", () => {
  it("refuses a PHP file renamed to .jpg, an SVG, and more than 5 MB, uploading nothing", async () => {
    actAs(editor);
    const before = await objectPaths();

    const php = await callForm(beranda.PATCH, {
      method: "PATCH",
      form: berandaForm({ file: Buffer.from("<?php system($_GET['c']); ?>"), fileName: "foto.jpg", alt: "Uji" }),
    });
    expect(php).toEqual({ status: 400, body: { error: "Foto harus berupa JPEG, PNG, atau WebP." } });

    const svg = await callForm(beranda.PATCH, {
      method: "PATCH",
      form: berandaForm({
        file: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
        fileName: "foto.svg",
        type: "image/svg+xml",
        alt: "Uji",
      }),
    });
    expect(svg).toEqual({ status: 400, body: { error: "Foto harus berupa JPEG, PNG, atau WebP." } });

    const big = Buffer.alloc(5 * 1024 * 1024 + 1);
    big.set([0xff, 0xd8, 0xff]);
    const tooLarge = await callForm(beranda.PATCH, { method: "PATCH", form: berandaForm({ file: big, alt: "Uji" }) });
    expect(tooLarge).toEqual({ status: 400, body: { error: "Ukuran foto maksimal 5 MB." } });

    expect(await objectPaths()).toEqual(before);
    expect((await profil()).hero_foto_path).toBeNull();
  });

  it("requires alt text for a photo", async () => {
    actAs(editor);
    const response = await callForm(beranda.PATCH, { method: "PATCH", form: berandaForm({ file: await jpeg().toBuffer() }) });
    expect(response).toEqual({ status: 400, body: { error: "Teks alternatif foto wajib diisi." } });
  });

  it("stores a JPEG with EXIF GPS without any metadata, under a random name, publicly readable", async () => {
    actAs(editor);
    const input = await jpegWithGps();
    expect((await sharp(input).metadata()).exif).toBeDefined();

    const response = await callForm(beranda.PATCH, {
      method: "PATCH",
      form: berandaForm({ file: input, fileName: "rumah-saya.jpg", alt: "Gedung gereja tampak depan" }),
    });
    expect(response.status).toBe(200);

    const row = await profil();
    expect(row.hero_foto_alt).toBe("Gedung gereja tampak depan");
    expect(row.hero_foto_path).toMatch(/^profil\/[0-9a-f-]{36}\.jpg$/);
    expect(row.hero_foto_path).not.toContain("rumah-saya");

    // Anyone can read it by URL (public bucket), and it carries no metadata.
    const stored = await fetch(`${env.url}/storage/v1/object/public/situs/${row.hero_foto_path}`);
    expect(stored.status).toBe(200);
    const bytes = Buffer.from(await stored.arrayBuffer());
    const metadata = await sharp(bytes).metadata();
    expect(metadata.exif).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
    expect(bytes.includes(Buffer.from("Exif"))).toBe(false);
    expect(bytes.includes(Buffer.from("UjiKamera"))).toBe(false);

    expect(await latestLog()).toEqual({
      module: "situs",
      activity: "Mengubah profil gereja bagian Beranda (foto ditambahkan)",
      user_email: "editor@gkp.test",
      ip_address: CLIENT_IP,
    });
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith("/", "layout");
  });

  it("drops a payload appended after the image", async () => {
    actAs(editor);
    const polyglot = Buffer.concat([await jpeg(32, 32).toBuffer(), Buffer.from("<?php system($_GET['c']); ?>")]);
    const response = await callForm(beranda.PATCH, { method: "PATCH", form: berandaForm({ file: polyglot, alt: "Uji" }) });
    expect(response.status).toBe(200);
    const { data, error } = await storage.download((await profil()).hero_foto_path!);
    if (error) throw error;
    expect(Buffer.from(await data.arrayBuffer()).includes(Buffer.from("<?php"))).toBe(false);
  });

  it("replacing the photo deletes the old object; changing only the alt text keeps it", async () => {
    actAs(editor);
    const oldPath = (await profil()).hero_foto_path!;

    const replaced = await callForm(beranda.PATCH, {
      method: "PATCH",
      form: berandaForm({ file: await jpeg(80, 60, "#205040").toBuffer(), alt: "Foto baru" }),
    });
    expect(replaced.status).toBe(200);
    const newPath = (await profil()).hero_foto_path!;
    expect(newPath).not.toBe(oldPath);
    const paths = await objectPaths();
    expect(paths).toContain(newPath);
    expect(paths).not.toContain(oldPath);
    expect((await latestLog()).activity).toBe("Mengubah profil gereja bagian Beranda (foto diganti)");

    const altOnly = await callForm(beranda.PATCH, { method: "PATCH", form: berandaForm({ alt: "Alt diubah" }) });
    expect(altOnly.status).toBe(200);
    expect(await profil()).toMatchObject({ hero_foto_path: newPath, hero_foto_alt: "Alt diubah" });
    expect(await objectPaths()).toContain(newPath);
    expect((await latestLog()).activity).toBe("Mengubah profil gereja bagian Beranda (teks alternatif foto diubah)");
  });

  it("deletes the new object again when the database write fails", async () => {
    actAs(editor);
    const before = await objectPaths();
    const pathBefore = (await profil()).hero_foto_path;

    // Fail only the profil_gereja UPDATE; the storage upload goes through.
    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");
      if (url.includes("/rest/v1/profil_gereja?") && method === "PATCH") {
        return new Response(JSON.stringify({ code: "XX000", message: "simulated failure" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }
      return realFetch(input, init);
    });

    const response = await callForm(beranda.PATCH, {
      method: "PATCH",
      form: berandaForm({ file: await jpeg(40, 40, "#445566").toBuffer(), alt: "Gagal" }),
    });
    vi.restoreAllMocks();

    expect(response.status).toBe(500);
    expect(await objectPaths()).toEqual(before);
    expect((await profil()).hero_foto_path).toBe(pathBefore);
  });

  it("removing the photo clears the row and deletes the object", async () => {
    actAs(editor);
    const oldPath = (await profil()).hero_foto_path!;
    const response = await callForm(beranda.PATCH, { method: "PATCH", form: berandaForm({ hapus: true }) });
    expect(response.status).toBe(200);
    expect(await profil()).toMatchObject({ hero_foto_path: null, hero_foto_alt: null });
    expect(await objectPaths()).not.toContain(oldPath);
    expect((await latestLog()).activity).toBe("Mengubah profil gereja bagian Beranda (foto dihapus)");
  });

  it("the sweep removes objects nothing refers to once past the grace period, and keeps referenced ones", async () => {
    actAs(editor);
    await callForm(tentang.PATCH, {
      method: "PATCH",
      form: (() => {
        const form = new FormData();
        form.append("sejarah", `${RUN} sejarah`);
        form.append("misi", "Misi satu\nMisi dua");
        return form;
      })(),
    });
    const kept = await callForm(beranda.PATCH, { method: "PATCH", form: berandaForm({ file: await jpeg().toBuffer(), alt: "Dipakai" }) });
    expect(kept.status).toBe(200);
    const keptPath = (await profil()).hero_foto_path!;

    const orphanPath = "profil/0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f.jpg";
    const upload = await storage.upload(orphanPath, await jpeg().toBuffer(), { contentType: "image/jpeg" });
    if (upload.error) throw upload.error;

    // Within the grace period (an upload still in flight): kept.
    await sweepSitusOrphans(editor.supabase as unknown as ServerSupabase);
    expect(await objectPaths()).toContain(orphanPath);

    // Past it: the orphan goes, the referenced photo stays.
    await sweepSitusOrphans(editor.supabase as unknown as ServerSupabase, Date.now() + 16 * 60 * 1000);
    const paths = await objectPaths();
    expect(paths).not.toContain(orphanPath);
    expect(paths).toContain(keptPath);
  });

  it("anon and signed-in users can't write to the bucket directly", async () => {
    const image = await jpeg().toBuffer();
    const anonUpload = await anon.storage.from("situs").upload("profil/anon-uji.jpg", image, { contentType: "image/jpeg" });
    expect(anonUpload.error).not.toBeNull();

    const editorUpload = await editor.supabase.storage
      .from("situs")
      .upload("profil/editor-uji.jpg", image, { contentType: "image/jpeg" });
    expect(editorUpload.error).not.toBeNull();

    const keptPath = (await profil()).hero_foto_path!;
    const editorRemove = await editor.supabase.storage.from("situs").remove([keptPath]);
    expect(editorRemove.data ?? []).toEqual([]);
    expect(await objectPaths()).toContain(keptPath);
    expect(await objectPaths()).not.toContain("profil/anon-uji.jpg");
    expect(await objectPaths()).not.toContain("profil/editor-uji.jpg");
  });

  it("a REST write can't point a photo at a path with no object", async () => {
    const { error } = await editor.supabase
      .from("profil_gereja")
      .update({ hero_foto_path: "profil/1e1e1e1e-1e1e-4e1e-8e1e-1e1e1e1e1e1e.jpg", hero_foto_alt: "Palsu" })
      .eq("id", 1);
    expect(error?.code).toBe("22023");
  });
});

describe("Kontak and Sosial Media", () => {
  it("validates the Maps URL, the WhatsApp number, and social hosts; normalizes and saves", async () => {
    actAs(editor);
    expect((await call(kontak.PATCH, { method: "PATCH", body: { mapsUrl: "https://evil.example/maps" } })).status).toBe(400);
    expect((await call(kontak.PATCH, { method: "PATCH", body: { telepon: "0812-3456-7890" } })).status).toBe(400);
    expect(
      (await call(sosialMedia.PATCH, { method: "PATCH", body: { instagramUrl: "https://instagram.com.evil.example/x" } }))
        .status,
    ).toBe(400);

    const saved = await call(kontak.PATCH, {
      method: "PATCH",
      body: { alamat: `${RUN} alamat`, telepon: "081234567890", email: "sekretariat@contoh.test", mapsUrl: "HTTPS://Maps.App.Goo.gl/Uji1" },
    });
    expect(saved.status).toBe(200);
    expect(await profil()).toMatchObject({ telepon: "081234567890", maps_url: "https://maps.app.goo.gl/Uji1" });
    expect(await logCount("Mengubah profil gereja bagian Kontak")).toBeGreaterThan(0);
  });
});

describe("Persembahan (situs_rekening:update)", () => {
  it("refuses the editor through the route, direct REST, and the RPC", async () => {
    actAs(editor);
    const form = new FormData();
    form.append("namaBank", "Bank Editor");
    form.append("nomorRekening", "1234567890");
    form.append("atasNama", "Editor");
    expect((await callForm(persembahan.PATCH, { method: "PATCH", form })).status).toBe(403);

    const direct = await editor.supabase
      .from("profil_gereja_rekening")
      .update({ nama_bank: "Bank Editor", nomor_rekening: "1234567890", atas_nama: "Editor" })
      .eq("id", 1)
      .select();
    expect(direct.data ?? []).toEqual([]);

    const rpc = await editor.supabase.rpc("update_profil_gereja_rekening", {
      p_nama_bank: "Bank Editor",
      p_nomor_rekening: "1234567890",
      p_atas_nama: "Editor",
    });
    expect(rpc.error?.code).toBe("42501");

    const { data } = await service.from("profil_gereja_rekening").select("nama_bank").eq("id", 1).single();
    expect(data?.nama_bank).toBeNull();
  });

  it("lets admin save, logging old and new values", async () => {
    actAs(admin);
    const first = new FormData();
    first.append("namaBank", "Bank Contoh");
    first.append("nomorRekening", "123 456 7890");
    first.append("atasNama", "Contoh Atas Nama");
    expect((await callForm(persembahan.PATCH, { method: "PATCH", form: first })).status).toBe(200);
    expect((await latestLog()).activity).toBe(
      'Mengubah rekening persembahan: nama bank (kosong) → "Bank Contoh"; nomor rekening (kosong) → "123 456 7890"; atas nama (kosong) → "Contoh Atas Nama"',
    );

    const second = new FormData();
    second.append("namaBank", "Bank Contoh");
    second.append("nomorRekening", "999 888 7777");
    second.append("atasNama", "Contoh Atas Nama");
    second.append("foto_file", new File([await jpeg().png().toBuffer()], "qris.png", { type: "image/png" }));
    second.append("foto_alt", "Kode QRIS");
    expect((await callForm(persembahan.PATCH, { method: "PATCH", form: second })).status).toBe(200);
    expect((await latestLog()).activity).toBe(
      'Mengubah rekening persembahan: nomor rekening "123 456 7890" → "999 888 7777"; QRIS ditambahkan',
    );

    const { data } = await service.from("profil_gereja_rekening").select("qris_foto_path").eq("id", 1).single();
    expect(data?.qris_foto_path).toMatch(/^profil\/[0-9a-f-]{36}\.png$/);
  });

  it("refuses a partly filled account", async () => {
    actAs(admin);
    const form = new FormData();
    form.append("namaBank", "Bank Saja");
    expect((await callForm(persembahan.PATCH, { method: "PATCH", form })).status).toBe(400);
  });
});

describe("Linimasa", () => {
  it("editor adds, edits, and reorders; only situs:delete may delete", async () => {
    actAs(editor);
    const a = await call(linimasa.POST, { method: "POST", body: { tahun: "1950-an", teks: `${RUN} awal` } });
    const b = await call(linimasa.POST, { method: "POST", body: { tahun: "1970", teks: `${RUN} kedua` } });
    expect([a.status, b.status]).toEqual([201, 201]);
    const idA = (a.body.data as unknown as { id: string }).id;
    const idB = (b.body.data as unknown as { id: string }).id;
    createdLinimasa.push(idA, idB);
    expect(await logCount(`Menambah linimasa "1950-an · ${RUN} awal"`)).toBe(1);

    expect(
      (await call(linimasaItem.PATCH, { method: "PATCH", params: { id: idA }, body: { tahun: "1951", teks: `${RUN} awal` } }))
        .status,
    ).toBe(200);

    const { data: all } = await service.from("profil_gereja_linimasa").select("id").order("sort_order");
    const ids = (all ?? []).map((row) => row.id);
    const reordered = [idB, ...ids.filter((id) => id !== idB)];
    expect((await call(linimasaReorder.POST, { method: "POST", body: { ids: reordered } })).status).toBe(200);
    const stale = await call(linimasaReorder.POST, { method: "POST", body: { ids: [idB] } });
    expect(stale).toEqual({ status: 400, body: { error: "Daftar linimasa sudah berubah. Muat ulang halaman lalu coba lagi." } });

    expect((await call(linimasaItem.DELETE, { method: "DELETE", params: { id: idA } })).status).toBe(403);

    actAs(admin);
    expect((await call(linimasaItem.DELETE, { method: "DELETE", params: { id: idA } })).status).toBe(200);
    expect(await logCount(`Menghapus linimasa "1951 · ${RUN} awal"`)).toBe(1);
  });
});

describe("anon public read (brief §14.6)", () => {
  it("returns only the public fields, and no table is readable directly", async () => {
    const { data, error } = await anon.rpc("public_profil_gereja");
    expect(error).toBeNull();
    const keys = Object.keys(data as Record<string, unknown>).sort();
    expect(keys).not.toContain("updated_at");
    expect(keys).not.toContain("id");
    expect(keys).toContain("linimasa");
    expect((data as { nomor_rekening: string }).nomor_rekening).toBe("999 888 7777");

    for (const table of ["profil_gereja", "profil_gereja_rekening", "profil_gereja_linimasa"] as const) {
      const direct = await anon.from(table).select("*");
      expect(direct.error?.code, table).toBe("42501");
    }
    expect((await anon.rpc("situs_referenced_photo_paths")).error).not.toBeNull();
  });
});
