import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { generateTempPassword, TEMP_PASSWORD_ALPHABET, TEMP_PASSWORD_LENGTH } = await import("./temp-password");

describe("generateTempPassword (brief §18.7)", () => {
  it("is 12 characters from the unambiguous alphabet, with a letter and a digit", () => {
    for (let i = 0; i < 500; i += 1) {
      const password = generateTempPassword();
      expect(password).toHaveLength(TEMP_PASSWORD_LENGTH);
      expect(password).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]+$/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[0-9]/);
    }
  });

  it("never uses characters that look alike", () => {
    for (const ambiguous of ["0", "o", "O", "1", "l", "I", "i"]) {
      expect(TEMP_PASSWORD_ALPHABET).not.toContain(ambiguous);
    }
  });

  it("uses every symbol, roughly evenly, and doesn't repeat", () => {
    const counts = new Map<string, number>();
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i += 1) {
      const password = generateTempPassword();
      seen.add(password);
      for (const char of password) counts.set(char, (counts.get(char) ?? 0) + 1);
    }
    expect(seen.size).toBe(2000);
    expect(counts.size).toBe(TEMP_PASSWORD_ALPHABET.length);
    const expected = (2000 * TEMP_PASSWORD_LENGTH) / TEMP_PASSWORD_ALPHABET.length;
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(expected * 0.75);
      expect(count).toBeLessThan(expected * 1.25);
    }
  });
});
