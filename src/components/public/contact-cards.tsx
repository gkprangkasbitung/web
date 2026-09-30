import { ClockIcon, MailIcon, MapPinIcon, MessageCircleIcon, PhoneIcon, type LucideIcon } from "lucide-react";

import type { KontakInfo } from "@/lib/public/site-content";

type Field = "alamat" | "telepon" | "email" | "jamSekretariat";

const FIELDS: { key: Field; label: string; icon: LucideIcon }[] = [
  { key: "alamat", label: "Alamat", icon: MapPinIcon },
  { key: "telepon", label: "Telepon / WhatsApp", icon: PhoneIcon },
  { key: "email", label: "Email", icon: MailIcon },
  { key: "jamSekretariat", label: "Jam sekretariat", icon: ClockIcon },
];

/**
 * Kontak's info cards (docs/design/kontak.html), also on Beranda's "Kunjungi
 * kami". From Profil Gereja (brief §14.1); a field that's empty has no card
 * (§14.6).
 */
export function ContactCards({ kontak }: { kontak: KontakInfo }) {
  const fields = FIELDS.filter(({ key }) => kontak[key] !== null);
  if (fields.length === 0) return null;

  return (
    <dl className="flex flex-col gap-3">
      {fields.map(({ key, label, icon: Icon }) => {
        const value = kontak[key]!;
        return (
          <div key={key} className="flex items-start gap-4 rounded-2xl border border-border bg-card p-5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-badge-accent text-badge-accent-foreground">
              <Icon aria-hidden="true" className="size-5" />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="font-medium break-words whitespace-pre-line">
                {key === "email" ? (
                  <a href={`mailto:${value}`} className="underline-offset-4 hover:underline">
                    {value}
                  </a>
                ) : key === "telepon" ? (
                  <a href={`tel:${value}`} className="font-mono tabular-nums underline-offset-4 hover:underline">
                    {value}
                  </a>
                ) : (
                  value
                )}
              </dd>
            </div>
          </div>
        );
      })}
    </dl>
  );
}

/** The `wa.me` button (lib/public/whatsapp.ts). The caller renders it only when there is a number. */
export function WhatsappButton({ waLink }: { waLink: string }) {
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
