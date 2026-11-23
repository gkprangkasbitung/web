/** The two ways to sign in at /portal/masuk (brief §18.7, stage 14d). Client-safe. */

export type CaraMasuk = "username" | "email";

export const CARA_MASUK: { value: CaraMasuk; label: string }[] = [
  { value: "username", label: "Username & password" },
  { value: "email", label: "Email & password" },
];

export const LOGIN_COPY: Record<CaraMasuk, { required: string; wrong: string }> = {
  username: { required: "Username dan password wajib diisi.", wrong: "Username atau password salah." },
  email: { required: "Email dan password wajib diisi.", wrong: "Email atau password salah." },
};

/** `?cara=email` picks the email tab; anything else is the username tab (the default). */
export function parseCaraMasuk(value: string | string[] | undefined): CaraMasuk {
  return (Array.isArray(value) ? value[0] : value) === "email" ? "email" : "username";
}
