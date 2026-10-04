/**
 * Builds a `wa.me` link from a secretariat phone number (brief §14.1, §D).
 * Digits only, per brief §11's phone rule; a leading "0" (the common local
 * format) becomes the "62" country code so the link works without the church
 * having to re-enter the number in international format.
 */
export function buildWaLink(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const withCountryCode = digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
  return `https://wa.me/${withCountryCode}`;
}

/** "Bagikan lewat WhatsApp" (brief §14.4, D): a share intent with no fixed recipient. */
export function buildShareWaLink(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
