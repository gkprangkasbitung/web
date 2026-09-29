/**
 * Sarana & Dana route handlers (brief §9.7) against the local stack: auth,
 * the item PATCH route distinguishing "Keterangan" from "Saldo Awal" by
 * which field was actually sent, transaction validation (whole numbers,
 * non-negative, bounded), the DB trigger's Persembahan Bulanan correction
 * showing up in the echoed response, and one activity log row per mutation.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addDays } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";

import { actAs, call, signIn, type Session } from "./harness";

const itemRoute = await import("@/app/api/admin/sarana-dana/[id]/route");
const transactionCollection = await import("@/app/api/admin/sarana-dana/[key]/transaksi/route");
const transactionItem = await import("@/app/api/admin/sarana-dana/[key]/transaksi/[id]/route");

const MISSING_ID = "9f9f9f9f-9f9f-4f9f-8f9f-9f9f9f9f9f9f";
const RUN = `E2E ${Date.now().toString(36)}`;
// activity_logs is append-only: a tanggal unique to this run keeps the
// "... tanggal ..." sentences from matching an earlier run's rows.
const TANGGAL = addDays("2030-01-01", Math.floor(Date.now() / 1000) % 100_000);

let editor: Session;
let viewer: Session;
let superadmin: Session;
const createdTransactions: string[] = [];
const restoreItems: { id: string; keterangan: string | null; saldo_awal: number }[] = [];

async function logRows(activity: string) {
  const { data, error } = await superadmin.supabase
    .from("activity_logs")
    .select("module, activity, user_email, ip_address")
    .eq("activity", activity);
  if (error) throw error;
  return data;
}

async function itemByKey(key: string) {
  const { data } = await superadmin.supabase.from("sarana_dana_items").select("id, key, name, keterangan, saldo_awal").eq("key", key).single();
  return data!;
}

beforeAll(async () => {
  [editor, viewer, superadmin] = await Promise.all([
    signIn("editor@gkp.test"),
    signIn("viewer@gkp.test"),
    signIn("superadmin@gkp.test"),
  ]);
});

afterAll(async () => {
  for (const id of createdTransactions) await superadmin.supabase.from("sarana_dana_transactions").delete().eq("id", id);
  for (const item of restoreItems) {
    await superadmin.supabase.from("sarana_dana_items").update({ keterangan: item.keterangan, saldo_awal: item.saldo_awal }).eq("id", item.id);
  }
});

describe("auth", () => {
  it("answers 401 to every request without a session", async () => {
    actAs(null);
    expect((await call(itemRoute.PATCH, { method: "PATCH", body: { keterangan: "x" }, params: { id: MISSING_ID } })).status).toBe(401);
    expect(
      (await call(transactionCollection.POST, { method: "POST", body: {}, params: { key: "kas_jemaat" } })).status,
    ).toBe(401);
    expect(
      (
        await call(transactionItem.PATCH, {
          method: "PATCH",
          body: {},
          params: { key: "kas_jemaat", id: MISSING_ID },
        })
      ).status,
    ).toBe(401);
    expect((await call(transactionItem.DELETE, { method: "DELETE", params: { key: "kas_jemaat", id: MISSING_ID } })).status).toBe(401);
  });

  it("lets the viewer read (RLS) but answers 403 to every write, with nothing written", async () => {
    const item = await itemByKey("kas_jemaat");
    actAs(viewer);

    const responses = [
      await call(itemRoute.PATCH, { method: "PATCH", body: { keterangan: "Ditolak" }, params: { id: item.id } }),
      await call(transactionCollection.POST, {
        method: "POST",
        body: { tanggal: TANGGAL, tipe: "masuk", jumlah: 1000 },
        params: { key: "kas_jemaat" },
      }),
    ];
    for (const response of responses) {
      expect(response.status).toBe(403);
      expect(response.body.error).toBe("Kamu tidak punya akses untuk tindakan ini.");
    }

    const { data: unchanged } = await superadmin.supabase.from("sarana_dana_items").select("keterangan").eq("id", item.id).single();
    expect(unchanged?.keterangan).toBe(item.keterangan);
  });
});

describe("PATCH item", () => {
  it("sends only Keterangan when that's the field that changed, and logs accordingly", async () => {
    const item = await itemByKey("kas_sarana_prasarana");
    restoreItems.push(item);
    actAs(editor);

    // "Mengubah keterangan {nama item}" carries no run-unique detail (by
    // design, it only names the item), so repeated runs must compare a
    // before/after count rather than an exact "1 row" match.
    const before = await logRows(`Mengubah keterangan ${item.name}`);

    const response = await call(itemRoute.PATCH, {
      method: "PATCH",
      body: { keterangan: `${RUN} keterangan` },
      params: { id: item.id },
    });
    expect(response.status).toBe(200);
    expect((response.body.data as unknown as { keterangan: string; saldo_awal: number }).keterangan).toBe(`${RUN} keterangan`);
    expect((response.body.data as unknown as { saldo_awal: number }).saldo_awal).toBe(item.saldo_awal);

    expect(await logRows(`Mengubah keterangan ${item.name}`)).toHaveLength(before.length + 1);
  });

  it("sends only Saldo Awal when that's the field that changed, and logs accordingly", async () => {
    const item = await itemByKey("kas_sarana_prasarana");
    actAs(editor);
    const nextSaldoAwal = 1_000_000 + (Date.now() % 100_000);

    const response = await call(itemRoute.PATCH, {
      method: "PATCH",
      body: { saldoAwal: nextSaldoAwal },
      params: { id: item.id },
    });
    expect(response.status).toBe(200);
    const data = response.body.data as unknown as { keterangan: string | null; saldo_awal: number };
    expect(data.saldo_awal).toBe(nextSaldoAwal);
    expect(data.keterangan).toBe(item.keterangan);

    expect(await logRows(`Mengubah saldo awal ${item.name} menjadi ${formatRupiah(nextSaldoAwal)}`)).toHaveLength(1);
  });

  it("answers 400 when neither field is sent", async () => {
    const item = await itemByKey("kas_jemaat");
    actAs(editor);
    const response = await call(itemRoute.PATCH, { method: "PATCH", body: {}, params: { id: item.id } });
    expect(response.status).toBe(400);
  });

  it("answers 404 for a missing or malformed id", async () => {
    actAs(editor);
    for (const id of [MISSING_ID, "bukan-uuid"]) {
      expect((await call(itemRoute.PATCH, { method: "PATCH", body: { keterangan: "x" }, params: { id } })).status).toBe(404);
    }
  });
});

describe("Tambah Transaksi", () => {
  it("rejects an unknown item key", async () => {
    actAs(editor);
    const response = await call(transactionCollection.POST, {
      method: "POST",
      body: { tanggal: TANGGAL, tipe: "masuk", jumlah: 1000 },
      params: { key: "bukan-item" },
    });
    expect(response.status).toBe(404);
  });

  it("rejects a decimal, a negative, and an over-the-ceiling jumlah", async () => {
    actAs(editor);
    for (const jumlah of [100.5, -1, 10_000_000_001]) {
      const response = await call(transactionCollection.POST, {
        method: "POST",
        body: { tanggal: TANGGAL, tipe: "masuk", jumlah },
        params: { key: "kas_jemaat" },
      });
      expect(response.status).toBe(400);
    }
  });

  it("Persembahan Bulanan: the echoed row reflects the DB's correction (tipe forced to masuk)", async () => {
    actAs(editor);
    const response = await call(transactionCollection.POST, {
      method: "POST",
      body: { tanggal: TANGGAL, tipe: "keluar", jumlah: 250_000 },
      params: { key: "persembahan_bulanan" },
    });
    expect(response.status).toBe(201);
    const data = response.body.data as unknown as { id: string; tipe: string; jumlah: number };
    createdTransactions.push(data.id);
    expect(data.tipe).toBe("masuk");

    expect(await logRows(`Menambah transaksi Rp 250.000 untuk Persembahan Bulanan tanggal ${TANGGAL}`)).toHaveLength(1);
  });

  it("other items: the echoed row reflects the DB's correction (jemaat_id forced null)", async () => {
    actAs(editor);
    const { data: person } = await superadmin.supabase.from("jemaat").select("id").limit(1).single();

    const response = await call(transactionCollection.POST, {
      method: "POST",
      body: { tanggal: TANGGAL, tipe: "masuk", jumlah: 500_000, jemaatId: person!.id },
      params: { key: "kas_jemaat" },
    });
    expect(response.status).toBe(201);
    const data = response.body.data as unknown as { id: string; jemaat_id: string | null };
    createdTransactions.push(data.id);
    expect(data.jemaat_id).toBeNull();

    expect(await logRows(`Menambah transaksi Rp 500.000 untuk Kas Jemaat tanggal ${TANGGAL}`)).toHaveLength(1);
  });
});

describe("Ubah / Hapus transaksi", () => {
  it("updates a transaction and logs one row", async () => {
    actAs(editor);
    const add = await call(transactionCollection.POST, {
      method: "POST",
      body: { tanggal: TANGGAL, tipe: "keluar", jumlah: 100_000 },
      params: { key: "kas_jemaat" },
    });
    const id = (add.body.data as unknown as { id: string }).id;
    createdTransactions.push(id);

    const edit = await call(transactionItem.PATCH, {
      method: "PATCH",
      body: { tanggal: TANGGAL, tipe: "keluar", jumlah: 150_000, keterangan: `${RUN} diubah` },
      params: { key: "kas_jemaat", id },
    });
    expect(edit.status).toBe(200);
    expect((edit.body.data as unknown as { jumlah: number }).jumlah).toBe(150_000);

    expect(await logRows(`Mengubah transaksi Rp 150.000 untuk Kas Jemaat tanggal ${TANGGAL}`)).toHaveLength(1);
  });

  it("answers 404 for a missing or malformed id, or a transaction under the wrong key", async () => {
    actAs(editor);
    const add = await call(transactionCollection.POST, {
      method: "POST",
      body: { tanggal: TANGGAL, tipe: "masuk", jumlah: 10_000 },
      params: { key: "kas_jemaat" },
    });
    const id = (add.body.data as unknown as { id: string }).id;
    createdTransactions.push(id);

    for (const badId of [MISSING_ID, "bukan-uuid"]) {
      expect(
        (
          await call(transactionItem.PATCH, {
            method: "PATCH",
            body: { tanggal: TANGGAL, tipe: "masuk", jumlah: 1 },
            params: { key: "kas_jemaat", id: badId },
          })
        ).status,
      ).toBe(404);
    }
    // The transaction is real, but under the wrong item key.
    expect(
      (
        await call(transactionItem.DELETE, {
          method: "DELETE",
          params: { key: "kas_sarana_prasarana", id },
        })
      ).status,
    ).toBe(404);
  });

  it("deletes a transaction and logs one row", async () => {
    actAs(editor);
    const add = await call(transactionCollection.POST, {
      method: "POST",
      body: { tanggal: TANGGAL, tipe: "masuk", jumlah: 75_000 },
      params: { key: "kas_sarana_prasarana" },
    });
    const id = (add.body.data as unknown as { id: string }).id;

    const remove = await call(transactionItem.DELETE, { method: "DELETE", params: { key: "kas_sarana_prasarana", id } });
    expect(remove.status).toBe(200);

    const { data } = await superadmin.supabase.from("sarana_dana_transactions").select("id").eq("id", id).maybeSingle();
    expect(data).toBeNull();

    expect(await logRows(`Menghapus transaksi Rp 75.000 untuk Kas Sarana dan Prasarana tanggal ${TANGGAL}`)).toHaveLength(1);
  });
});
