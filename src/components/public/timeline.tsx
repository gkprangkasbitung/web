/**
 * Tentang Kami's "Linimasa" (docs/design/tentang-kami.html), from Profil Gereja (brief §14.1).
 * Each item draws its own segment of the line, so the line and dots stay
 * aligned on every row when there are more items than fit on one row.
 */
export function Timeline({ items }: { items: { tahun: string; teks: string }[] }) {
  return (
    <ol className="grid grid-cols-1 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item, index) => (
        <li key={index} className="relative flex flex-col gap-2 border-t border-border pt-6 sm:pr-6">
          <span aria-hidden="true" className="absolute -top-1.5 left-0 size-2.5 rounded-full bg-primary" />
          <span className="font-serif text-2xl text-primary">{item.tahun}</span>
          <span className="text-sm break-words text-muted-foreground">{item.teks}</span>
        </li>
      ))}
    </ol>
  );
}
