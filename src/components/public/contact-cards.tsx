import { ClockIcon, MailIcon, MapPinIcon, MessageCircleIcon, PhoneIcon, type LucideIcon } from "lucide-react";

import type { KontakInfo } from "@/lib/public/site-content";

const FIELDS: { key: keyof KontakInfo; label: string; icon: LucideIcon }[] = [
  { key: "alamat", label: "Alamat", icon: MapPinIcon },
  { key: "telepon", label: "Telepon / WhatsApp", icon: PhoneIcon },
  { key: "email", label: "Email", icon: MailIcon },
  { key: "jamSekretariat", label: "Jam sekretariat", icon: ClockIcon },
];

/** Kontak's info cards (docs/design/kontak.html), also reused on Beranda's "Kunjungi kami". Placeholder until stage 11a (§14.1). */
export function ContactCards({ kontak }: { kontak: KontakInfo }) {
  return (
    <div className="flex flex-col gap-3">
      {FIELDS.map(({ key, label, icon: Icon }) => (
        <div key={key} className="flex items-start gap-4 rounded-2xl border border-border bg-card p-5">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-badge-accent text-badge-accent-foreground">
            <Icon aria-hidden="true" className="size-5" />
          </span>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">{label}</span>
            <span className="font-medium">{kontak[key] ?? `TODO: ${label.toLowerCase()}`}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The `wa.me` button (brief §D): a real link built from the loader's number
 * (`lib/public/whatsapp.ts`). The number itself is a TODO placeholder until
 * stage 11a, so the button shows a neutral disabled-looking state instead of
 * a broken link — once a real number lands, this renders live without any
 * code change here.
 */
export function WhatsappButton({ waLink }: { waLink: string | null }) {
  if (!waLink) {
    return (
      <span className="flex h-12 items-center justify-center gap-2 rounded-full border border-dashed border-input px-6 text-sm text-muted-foreground">
        Nomor WhatsApp belum tersedia
      </span>
    );
  }
  return (
    <a
      href={waLink}
      target="_blank"
      rel="noopener noreferrer"
      className="flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground outline-none hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <MessageCircleIcon aria-hidden="true" className="size-4" />
      Chat via WhatsApp
    </a>
  );
}
