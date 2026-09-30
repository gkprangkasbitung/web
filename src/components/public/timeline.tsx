/** Tentang Kami's "Linimasa" (docs/design/tentang-kami.html). Placeholder until stage 11a (§14.1). */
export function Timeline({ items }: { items: { tahun: string; teks: string }[] }) {
  return (
    <div className="grid grid-cols-1 gap-6 border-t border-border pt-6 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item, index) => (
        <div key={index} className="relative flex flex-col gap-2">
          <span aria-hidden="true" className="absolute -top-[29px] size-2.5 rounded-full bg-primary" />
          <span className="font-serif text-2xl text-primary">{item.tahun}</span>
          <span className="text-sm text-muted-foreground">{item.teks}</span>
        </div>
      ))}
    </div>
  );
}
