/**
 * Portal Jemaat pages (brief §17.3, stage 13b): every page renders for a
 * jemaat with data and for one with none, and /jemaat/persembahan 404s
 * while the site setting is off. Pages read everything through
 * `lib/portal` with the caller's own session (checked indirectly: every
 * assertion here is reachable only through RLS-respecting reads).
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { today, weekContaining } from "@/lib/dates";

import { actAs, createTestUser, PASSWORD, serviceClient, signIn, type Session } from "./harness";

// Both only matter inside a real Next.js request/router, which
// `renderToStaticMarkup` doesn't provide; everything else (redirect,
// notFound, …) stays real, since requireJemaat() and /jemaat/persembahan
// both use it.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: () => {} }),
}));

const RUN = Date.now().toString(36);
// persembahan_saya() is scoped to the caller's own jemaat_id, so the real
// current year is fine (no collision risk with other fixtures or seed
// data); the page's own year ceiling refuses a future one anyway.
const YEAR = Number(today().slice(0, 4));

const svc = serviceClient();
const created = {
  users: [] as string[],
  jemaat: [] as string[],
  keluarga: [] as string[],
  komisi: [] as string[],
  tempat: [] as string[],
  items: [] as string[],
  transactions: [] as string[],
};
let settingBefore = false;

type Account = { id: string; email: string; session: Session; jemaatId: string };

function must<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) throw new Error(result.error?.message ?? "no data");
  return result.data;
}

async function newJemaat(fields: Record<string, unknown>): Promise<string> {
  const { id } = must(await svc.from("jemaat").insert(fields as never).select("id").single());
  created.jemaat.push(id);
  return id;
}

async function account(label: string, jemaatFields: Record<string, unknown>): Promise<Account> {
  const jemaatId = await newJemaat(jemaatFields);
  const email = `jemaat-pages-${label}-${RUN}@test.local`;
  const id = await createTestUser(email, PASSWORD);
  created.users.push(id);
  const { error } = await svc.from("profiles").update({ jemaat_id: jemaatId }).eq("id", id);
  if (error) throw error;
  return { id, email, session: await signIn(email, PASSWORD), jemaatId };
}

async function setPersembahanSetting(on: boolean) {
  const { error } = await svc.from("profil_gereja").update({ portal_tampilkan_persembahan: on }).eq("id", 1);
  if (error) throw error;
}

/** Runs something that should throw Next's `notFound()`; fails if it doesn't. */
async function notFoundOf(run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (error) {
    if ((error as { digest?: string }).digest === "NEXT_HTTP_ERROR_FALLBACK;404") return;
    throw error;
  }
  throw new Error("Expected notFound()");
}

const beranda = async () => (await import("@/app/jemaat/(portal)/page")).default();
const profil = async () => (await import("@/app/jemaat/(portal)/profil/page")).default();
const pelayanan = async () => (await import("@/app/jemaat/(portal)/pelayanan/page")).default();
const komisi = async () => (await import("@/app/jemaat/(portal)/komisi/page")).default();
const akun = async () => (await import("@/app/jemaat/(portal)/akun/page")).default();
const persembahan = async (tahun?: string) =>
  (await import("@/app/jemaat/(portal)/persembahan/page")).default({ searchParams: Promise.resolve(tahun ? { tahun } : {}) });

let kaya: Account;
let kosong: Account;

beforeAll(async () => {
  settingBefore = must(await svc.from("profil_gereja").select("portal_tampilkan_persembahan").eq("id", 1).single())
    .portal_tampilkan_persembahan;

  kaya = await account("kaya", {
    nama: `Uji Kaya ${RUN}`,
    nomor_anggota: `UJI-KY-${RUN}`,
    status_keanggotaan: "sidi",
    pekerjaan: "Guru",
    alamat: "Jalan Kaya 1",
    no_hp: "081100001111",
  });
  kosong = await account("kosong", { nama: `Uji Kosong ${RUN}`, status_keanggotaan: "simpatisan" });

  // kaya: a schedule row this week (so Beranda and Pelayanan both show it),
  // a komisi membership, a rejected pengajuan (history), and a Persembahan
  // Bulanan row this year.
  const umum = must(await svc.from("peribadahan_categories").select("id").eq("key", "umum").single());
  const tempat = must(await svc.from("tempat").insert({ nama: `Tempat Uji ${RUN}` }).select("id").single());
  created.tempat.push(tempat.id);
  const item = must(
    await svc
      .from("peribadahan_items")
      .insert({
        category_id: umum.id,
        tanggal: weekContaining().start,
        jam: "08:00",
        tempat_id: tempat.id,
        pelayan_firman_id: kaya.jemaatId,
      })
      .select("id")
      .single(),
  );
  created.items.push(item.id);

  const anggotaJabatan = must(await svc.from("jabatan_komisi").select("id").eq("nama", "Anggota").single());
  const komisiRow = must(
    await svc.from("komisi").insert({ nama: `Komisi Uji Halaman ${RUN}`, slug: `komisi-uji-halaman-${RUN}`, tampil: true }).select("id").single(),
  );
  created.komisi.push(komisiRow.id);
  must(await svc.from("komisi_anggota").insert({ komisi_id: komisiRow.id, jemaat_id: kaya.jemaatId, jabatan_id: anggotaJabatan.id }).select("id"));

  const submitted = await kaya.session.supabase.schema("portal").rpc("ajukan_perubahan", { data: { pekerjaan: "Dosen" } });
  if (submitted.error) throw submitted.error;
  const superadmin = await signIn("superadmin@gkp.test");
  const rejected = await superadmin.supabase.rpc("tolak_pengajuan", { p_id: submitted.data as string, p_catatan: "Perlu bukti." });
  if (rejected.error) throw rejected.error;

  const persembahanItem = must(await svc.from("sarana_dana_items").select("id").eq("key", "persembahan_bulanan").single());
  const transaction = must(
    await svc
      .from("sarana_dana_transactions")
      .insert({ item_id: persembahanItem.id, tanggal: `${YEAR}-02-10`, tipe: "masuk", jumlah: 150000, jemaat_id: kaya.jemaatId })
      .select("id")
      .single(),
  );
  created.transactions.push(transaction.id);
});

afterAll(async () => {
  actAs(null);
  await setPersembahanSetting(settingBefore);
  for (const id of created.users) await svc.auth.admin.deleteUser(id);
  if (created.transactions.length) await svc.from("sarana_dana_transactions").delete().in("id", created.transactions);
  if (created.items.length) await svc.from("peribadahan_items").delete().in("id", created.items);
  if (created.komisi.length) await svc.from("komisi").delete().in("id", created.komisi);
  if (created.jemaat.length) await svc.from("jemaat").delete().in("id", created.jemaat);
  if (created.tempat.length) await svc.from("tempat").delete().in("id", created.tempat);
});

describe("every page renders for a jemaat with data", () => {
  beforeAll(() => actAs(kaya.session));

  it("Beranda greets by name and shows this week's own service", async () => {
    const html = renderToStaticMarkup(await beranda());
    expect(html).toContain(`Selamat datang, Uji Kaya ${RUN}`);
    expect(html).toContain("Pelayan Firman");
    expect(html).toContain(`Tempat Uji ${RUN}`);
  });

  it("Profil shows the data diri fields and the rejected pengajuan with its catatan", async () => {
    const html = renderToStaticMarkup(await profil());
    expect(html).toContain(`Uji Kaya ${RUN}`);
    expect(html).toContain(`UJI-KY-${RUN}`);
    expect(html).toContain("Perubahan: Pekerjaan"); // the field name only, never the requested value
    expect(html).toContain("Ditolak");
    expect(html).toContain("Perlu bukti.");
    expect(html).toContain("Ajukan perubahan data");
  });

  it("Pelayanan lists the upcoming row", async () => {
    const html = renderToStaticMarkup(await pelayanan());
    expect(html).toContain("Pelayan Firman");
    expect(html).toContain(`Tempat Uji ${RUN}`);
  });

  it("Komisi lists the membership", async () => {
    const html = renderToStaticMarkup(await komisi());
    expect(html).toContain(`Komisi Uji Halaman ${RUN}`);
    expect(html).toContain("Anggota");
  });

  it("Akun shows the email", async () => {
    const html = renderToStaticMarkup(await akun());
    expect(html).toContain(kaya.email);
    expect(html).toContain("Hapus akun login");
  });
});

describe("every page renders for a jemaat with no data, with friendly empty states", () => {
  beforeAll(() => actAs(kosong.session));

  it("Beranda shows the empty pelayanan line", async () => {
    const html = renderToStaticMarkup(await beranda());
    expect(html).toContain(`Selamat datang, Uji Kosong ${RUN}`);
    expect(html).toContain("Tidak ada jadwal pelayanan minggu ini.");
  });

  it("Profil shows the profile without a family section or a pengajuan status", async () => {
    const html = renderToStaticMarkup(await profil());
    expect(html).toContain(`Uji Kosong ${RUN}`);
    expect(html).not.toContain("Anggota Keluarga");
    expect(html).not.toContain("Status pengajuan terakhir");
    const submitButton = html.match(/Ajukan perubahan data/);
    expect(submitButton).not.toBeNull();
  });

  it("Pelayanan shows both empty states", async () => {
    const html = renderToStaticMarkup(await pelayanan());
    expect(html).toContain("Tidak ada jadwal pelayanan dalam 60 hari ke depan.");
  });

  it("Komisi shows its empty state", async () => {
    const html = renderToStaticMarkup(await komisi());
    expect(html).toContain("Anda belum tercatat sebagai anggota komisi apa pun.");
  });
});

describe("/jemaat/persembahan", () => {
  it("404s while the setting is off", async () => {
    await setPersembahanSetting(false);
    actAs(kaya.session);
    await notFoundOf(() => persembahan());
  });

  it("renders the jemaat's own rows and total while the setting is on; empty for a jemaat with none", async () => {
    await setPersembahanSetting(true);

    actAs(kaya.session);
    const kayaHtml = renderToStaticMarkup(await persembahan(String(YEAR)));
    expect(kayaHtml).toContain("150.000");
    expect(kayaHtml).toContain(String(YEAR));

    actAs(kosong.session);
    const kosongHtml = renderToStaticMarkup(await persembahan(String(YEAR)));
    expect(kosongHtml).toContain(`Belum ada data persembahan untuk tahun ${YEAR}.`);
  });
});
