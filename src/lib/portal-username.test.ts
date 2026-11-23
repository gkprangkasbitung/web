import { describe, expect, it } from "vitest";

import {
  firstFreeUsername,
  isUsernameTerlarang,
  normalizeUsername,
  usernameDasar,
  usernameError,
  usernameSchema,
  usulkanUsername,
  withSuffix,
} from "./portal-username";

const NONE = new Set<string>();

describe("usernameDasar (brief §18.7)", () => {
  it("strips honorifics and the degree after a comma, then joins first + last word", () => {
    expect(usernameDasar("Bpk. Yohanes Budi Santoso, S.Th.")).toBe("yohanes.santoso");
  });

  it("keeps a single word as it is", () => {
    expect(usernameDasar("Ibu Sri")).toBe("sri");
  });

  it("drops everything after the first comma, whatever it is", () => {
    expect(usernameDasar("Maria Simanjuntak, S.Pd., M.Si.")).toBe("maria.simanjuntak");
    expect(usernameDasar("Sdr. Daniel Hutapea, Jr")).toBe("daniel.hutapea");
  });

  it("removes diacritics instead of dropping the letter", () => {
    expect(usernameDasar("Ibu José Müller")).toBe("jose.muller");
    expect(usernameDasar("Sdri. Ñoño Ångström")).toBe("nono.angstrom");
    expect(usernameDasar("Bpk. Ｙｏｈａｎｅｓ")).toBe("yohanes");
  });

  it("strips every listed honorific, repeated, case-insensitively, with or without a dot", () => {
    for (const title of ["Bpk.", "Bapak", "Ibu", "Sdr.", "Sdri.", "Pdt.", "Pnt.", "Dkn.", "St.", "BPK", "pdt"]) {
      expect(usernameDasar(`${title} Andreas Purba`)).toBe("andreas.purba");
    }
    expect(usernameDasar("Pdt. Em. Dr. Andreas Purba")).toBe("andreas.purba");
    expect(usernameDasar("Bpk.Andreas Purba")).toBe("andreas.purba");
  });

  it("only strips honorifics at the front", () => {
    expect(usernameDasar("Andreas St Purba")).toBe("andreas.purba");
    expect(usernameDasar("Andreas Ibu")).toBe("andreas.ibu");
  });

  it("keeps a–z0–9 only inside each word", () => {
    expect(usernameDasar("Siti-Nur O'Neil")).toBe("sitinur.oneil");
    expect(usernameDasar("  Bpk.   Yohanes   Budi  ")).toBe("yohanes.budi");
  });

  it("truncates to 30 characters without a trailing dot", () => {
    const base = usernameDasar("Bpk. Abcdefghijklmnopqrstuvwxyzabcd Santoso");
    expect(base).toBe("abcdefghijklmnopqrstuvwxyzabcd");
    expect(usernameDasar("Abcdefghijklmnopqrstuvwxyzabc Santoso")).toBe("abcdefghijklmnopqrstuvwxyzabc");
    expect(usernameDasar("Abcdefghijklmnopqrstuvwxyzab Santoso")).toBe("abcdefghijklmnopqrstuvwxyzab.s");
  });

  it("gives null when fewer than 3 valid characters are left", () => {
    expect(usernameDasar("Ibu Iy")).toBeNull();
    expect(usernameDasar("Bpk.")).toBeNull();
    expect(usernameDasar("")).toBeNull();
    expect(usernameDasar("李明")).toBeNull();
  });
});

describe("collisions", () => {
  it("appends 2, 3, … on collision", () => {
    expect(usulkanUsername("Bpk. Yohanes Budi Santoso", NONE)).toBe("yohanes.santoso");
    expect(usulkanUsername("Bpk. Yohanes Budi Santoso", new Set(["yohanes.santoso"]))).toBe("yohanes.santoso2");
    expect(usulkanUsername("Yohanes Santoso", new Set(["yohanes.santoso", "yohanes.santoso2"]))).toBe(
      "yohanes.santoso3",
    );
  });

  it("keeps a suffixed username within 30 characters", () => {
    const base = "abcdefghijklmnopqrstuvwxyzabcd";
    expect(withSuffix(base, 2)).toBe("abcdefghijklmnopqrstuvwxyzabc2");
    expect(withSuffix(base, 12)).toBe("abcdefghijklmnopqrstuvwxyzab12");
    expect(firstFreeUsername(base, new Set([base]))).toHaveLength(30);
    // A cut that would end on a dot drops the dot.
    expect(withSuffix("abcdefghijklmnopqrstuvwxyza.bc", 22)).toBe("abcdefghijklmnopqrstuvwxyza22");
  });

  it("can start at a later suffix (server retry after a clash)", () => {
    expect(firstFreeUsername("sri", NONE, 3)).toBe("sri3");
  });
});

describe("reserved words", () => {
  it("refuses a reserved word as any segment, with or without trailing digits", () => {
    expect(isUsernameTerlarang("admin")).toBe(true);
    expect(isUsernameTerlarang("admin2")).toBe(true);
    expect(isUsernameTerlarang("gkp.admin")).toBe(true);
    expect(isUsernameTerlarang("ADMIN")).toBe(true);
    expect(isUsernameTerlarang("administrasi")).toBe(false);
    expect(isUsernameTerlarang("yohanes.santoso")).toBe(false);
  });

  it("suggests nothing for a name that comes out reserved", () => {
    expect(usulkanUsername("Bpk. Admin", NONE)).toBeNull();
    expect(usulkanUsername("Sdr. Admin Siregar", NONE)).toBeNull();
    expect(usulkanUsername("Ibu Portal", NONE)).toBeNull();
  });
});

describe("usernameError / usernameSchema", () => {
  it("accepts the documented format", () => {
    for (const ok of ["sri", "yohanes.santoso", "a1.b2.c3", "budi2", "x".repeat(30)]) {
      expect(usernameError(ok)).toBeNull();
    }
  });

  it("refuses everything else with a message", () => {
    expect(usernameError("")).toBe("Username wajib diisi.");
    expect(usernameError("ab")).toMatch(/minimal 3/);
    expect(usernameError("x".repeat(31))).toMatch(/maksimal 30/);
    for (const bad of ["Budi", "budi..santoso", ".budi", "budi.", "budi_santoso", "budi santoso", "budí"]) {
      expect(usernameError(bad)).toMatch(/huruf kecil/);
    }
    expect(usernameError("root")).toMatch(/tidak boleh dipakai/);
  });

  it("trims and lowercases before checking", () => {
    expect(normalizeUsername("  Yohanes.Santoso ")).toBe("yohanes.santoso");
    expect(usernameSchema.parse(" Sri ")).toBe("sri");
    expect(usernameSchema.safeParse("admin").success).toBe(false);
  });
});
