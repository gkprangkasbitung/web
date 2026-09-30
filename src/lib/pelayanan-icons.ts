import {
  BabyIcon,
  BookOpenIcon,
  CoffeeIcon,
  GraduationCapIcon,
  HandHeartIcon,
  HeartHandshakeIcon,
  Mic2Icon,
  Music2Icon,
  UsersIcon,
  UsersRoundIcon,
  type LucideIcon,
} from "lucide-react";

/**
 * The fixed icon list Pelayanan cards choose from (brief §14.2): the admin
 * stores only the key, never an SVG. Keep this list in sync with the
 * `pelayanan_icon_check` constraint in 0030_situs_pelayanan_majelis_kegiatan.sql.
 */
export const PELAYANAN_ICONS: readonly { key: string; label: string; icon: LucideIcon }[] = [
  { key: "HeartHandshake", label: "Pelayanan Kasih", icon: HeartHandshakeIcon },
  { key: "Users", label: "Persekutuan", icon: UsersIcon },
  { key: "GraduationCap", label: "Pendidikan", icon: GraduationCapIcon },
  { key: "BookOpen", label: "Pemahaman Alkitab", icon: BookOpenIcon },
  { key: "Music2", label: "Musik & Pujian", icon: Music2Icon },
  { key: "Baby", label: "Anak-anak", icon: BabyIcon },
  { key: "HandHeart", label: "Diakonia", icon: HandHeartIcon },
  { key: "Mic2", label: "Multimedia", icon: Mic2Icon },
  { key: "Coffee", label: "Keramahtamahan", icon: CoffeeIcon },
  { key: "UsersRound", label: "Kelompok Usia", icon: UsersRoundIcon },
];

const BY_KEY = new Map(PELAYANAN_ICONS.map((item) => [item.key, item]));

export function pelayananIcon(key: string): LucideIcon {
  return BY_KEY.get(key)?.icon ?? HeartHandshakeIcon;
}
