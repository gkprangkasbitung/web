import "server-only";

import { randomInt } from "node:crypto";

/**
 * The temporary-password alphabet (brief §18.7): lowercase letters and
 * digits without the ones that look alike (0/o, 1/l/i), so it can be typed
 * from a printed slip on a phone without guessing. 31 symbols × 12 ≈ 59
 * bits, behind a login lockout and replaced at first login.
 */
export const TEMP_PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export const TEMP_PASSWORD_LENGTH = 12;

const DIGITS = /[0-9]/;
const LETTERS = /[a-z]/;

/**
 * A fresh temporary password from `crypto.randomInt` (uniform, no modulo
 * bias). Redrawn until it has a letter and a digit, so it passes a
 * "letters and digits" password policy if production turns one on. Never
 * stored or logged; only returned to the admin who asked for it.
 */
export function generateTempPassword(): string {
  for (;;) {
    let password = "";
    for (let i = 0; i < TEMP_PASSWORD_LENGTH; i += 1) {
      password += TEMP_PASSWORD_ALPHABET[randomInt(TEMP_PASSWORD_ALPHABET.length)];
    }
    if (DIGITS.test(password) && LETTERS.test(password)) return password;
  }
}
