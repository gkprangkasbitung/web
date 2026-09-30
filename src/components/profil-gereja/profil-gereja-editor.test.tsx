import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProfilGerejaAdminData, ProfilGerejaRow, RekeningRow } from "@/lib/profil-gereja";

import { ProfilGerejaEditor, type ProfilGerejaAccess } from "./profil-gereja-editor";

// lib/supabase/env.ts reads these once, at import: set them before any import runs.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
});

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: (message: string) => toastSuccess(message), error: (message: string) => toastError(message) },
}));

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:preview", revokeObjectURL: () => {} }));
  fetchMock.mockReset();
  refresh.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const PROFIL: ProfilGerejaRow = {
  id: 1,
  hero_judul: "Selamat datang",
  hero_subjudul: null,
  hero_foto_path: null,
  hero_foto_alt: null,
  sambutan_teks: null,
  sambutan_pendeta_id: null,
  sejarah: null,
  visi: null,
  misi: ["Misi satu", "Misi dua"],
  sejarah_foto_path: null,
  sejarah_foto_alt: null,
  alamat: null,
  telepon: null,
  email: null,
  jam_sekretariat: null,
  maps_url: null,
  instagram_url: null,
  youtube_url: null,
  facebook_url: null,
  updated_at: "2026-09-30T00:00:00Z",
};

const REKENING: RekeningRow = {
  id: 1,
  nama_bank: "Bank Contoh",
  nomor_rekening: "1234567890",
  atas_nama: "Contoh",
  qris_foto_path: null,
  qris_foto_alt: null,
  updated_at: "2026-09-30T00:00:00Z",
};

const DATA: ProfilGerejaAdminData = {
  profil: PROFIL,
  rekening: REKENING,
  linimasa: [{ id: "l1", tahun: "1950-an", teks: "Awal persekutuan", sort_order: 0 }],
  pendeta: [
    {
      id: "p1",
      nama: "Pdt. Contoh",
      peran: "Pendeta Jemaat",
      tahun_mulai: 2015,
      tahun_selesai: null,
      foto_path: null,
      foto_alt: null,
      keterangan: null,
      tampil: true,
    },
  ],
};

const EDITOR: ProfilGerejaAccess = { canUpdate: true, canCreate: true, canDelete: false, canEditRekening: false };
const VIEWER: ProfilGerejaAccess = { canUpdate: false, canCreate: false, canDelete: false, canEditRekening: false };

function section(name: string) {
  return screen.getByRole("region", { name });
}

describe("ProfilGerejaEditor", () => {
  it("read-only (situs:read): every section shows, inputs disabled, no save, photo, or list controls", () => {
    render(<ProfilGerejaEditor data={DATA} access={VIEWER} />);

    for (const name of ["Beranda", "Sambutan", "Tentang", "Linimasa", "Kontak", "Sosial Media", "Persembahan"]) {
      expect(section(name)).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: "Simpan" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pilih Foto|Ganti Foto|Hapus Foto/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tambah Linimasa" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ubah urutan/ })).not.toBeInTheDocument();
    for (const textbox of screen.getAllByRole("textbox")) expect(textbox).toBeDisabled();
    expect(within(section("Tentang")).getByLabelText("Misi")).toHaveValue("Misi satu\nMisi dua");
  });

  it("editor without situs_rekening:update: Persembahan stays read-only, the rest is editable", () => {
    render(<ProfilGerejaEditor data={DATA} access={EDITOR} />);

    const persembahan = section("Persembahan");
    expect(within(persembahan).queryByRole("button", { name: "Simpan" })).not.toBeInTheDocument();
    expect(within(persembahan).getByLabelText("Nomor rekening")).toBeDisabled();
    expect(within(persembahan).getByText(/situs_rekening:update/)).toBeInTheDocument();

    expect(within(section("Beranda")).getByRole("button", { name: "Simpan" })).toBeInTheDocument();
    expect(within(section("Linimasa")).queryByRole("button", { name: "Hapus" })).not.toBeInTheDocument();
    expect(within(section("Linimasa")).getByRole("button", { name: "Tambah Linimasa" })).toBeInTheDocument();
  });

  it("a new photo needs alt text before anything is sent", async () => {
    const user = userEvent.setup();
    render(<ProfilGerejaEditor data={DATA} access={EDITOR} />);
    const beranda = section("Beranda");

    const fileInput = beranda.querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(fileInput, new File([new Uint8Array([0xff, 0xd8, 0xff])], "hero.jpg", { type: "image/jpeg" }));
    expect(await within(beranda).findByText("Foto baru dipilih. Simpan untuk menerapkannya.")).toBeInTheDocument();

    await user.click(within(beranda).getByRole("button", { name: "Simpan" }));
    expect(within(beranda).getByRole("alert")).toHaveTextContent("Teks alternatif foto wajib diisi.");
    expect(within(beranda).getByLabelText(/Teks alternatif/)).toHaveAttribute("aria-invalid", "true");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("saves the section's fields and the photo in one multipart request", async () => {
    const user = userEvent.setup();
    render(<ProfilGerejaEditor data={DATA} access={EDITOR} />);
    const beranda = section("Beranda");

    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "hero.jpg", { type: "image/jpeg" });
    await user.upload(beranda.querySelector<HTMLInputElement>('input[type="file"]')!, file);
    await user.type(within(beranda).getByLabelText(/Teks alternatif/), "Gedung gereja");

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            ...PROFIL,
            hero_foto_path: "profil/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1.jpg",
            hero_foto_alt: "Gedung gereja",
          },
        }),
        { status: 200 },
      ),
    );
    await user.click(within(beranda).getByRole("button", { name: "Simpan" }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Bagian Beranda disimpan"));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/admin/profil-gereja/beranda");
    expect(init.method).toBe("PATCH");
    const body = init.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("heroJudul")).toBe("Selamat datang");
    expect(body.get("foto_alt")).toBe("Gedung gereja");
    expect((body.get("foto_file") as File).name).toBe("hero.jpg");
    expect(init.headers).toBeUndefined();
    expect(refresh).toHaveBeenCalled();
    // After the save the saved photo can be replaced or removed.
    expect(within(beranda).getByRole("button", { name: "Hapus Foto" })).toBeInTheDocument();
  });

  it("checks the Persembahan account fields are all filled or all empty", async () => {
    const user = userEvent.setup();
    render(<ProfilGerejaEditor data={DATA} access={{ ...EDITOR, canEditRekening: true }} />);
    const persembahan = section("Persembahan");

    await user.clear(within(persembahan).getByLabelText("Atas nama"));
    await user.click(within(persembahan).getByRole("button", { name: "Simpan" }));
    expect(within(persembahan).getByRole("alert")).toHaveTextContent(
      "Isi nama bank, nomor rekening, dan atas nama sekaligus, atau kosongkan ketiganya.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
