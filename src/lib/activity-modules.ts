/** Activity log modules and their display labels (brief §7). Keluarga logs under `jemaat`. */
export const MODULE_LABELS = {
  auth: "Autentikasi",
  akun: "Akun Saya",
  warta: "Warta",
  peribadahan: "Peribadahan",
  litbang: "Litbang",
  sarana_dana: "Sarana & Dana",
  tempat: "Tempat",
  wilayah: "Wilayah",
  jemaat: "Jemaat",
  label_jemaat: "Label Jemaat",
  users: "Pengguna",
  roles: "Roles & Permissions",
} as const;

export type ActivityModule = keyof typeof MODULE_LABELS;

export const ACTIVITY_MODULES = Object.keys(MODULE_LABELS) as ActivityModule[];

export function moduleLabel(module: string): string {
  return module in MODULE_LABELS ? MODULE_LABELS[module as ActivityModule] : module;
}
