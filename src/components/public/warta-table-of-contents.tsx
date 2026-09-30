/**
 * The in-page jump list from `docs/design/warta-detail.html`'s left rail.
 * Static anchors, no scroll-spy: keyboard- and screen-reader-friendly with
 * no extra script, and it only ever lists sections `WartaPublicView` kept
 * (brief §8's "hide empty sections" rule already decides that upstream).
 */
export function WartaTableOfContents({ sections }: { sections: { id: string; label: string }[] }) {
  if (sections.length === 0) return null;
  return (
    <nav aria-label="Isi warta" className="hidden lg:block">
      <div className="sticky top-24 flex flex-col gap-0.5 border-l border-border pl-4">
        {sections.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className="rounded-r-md py-1.5 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {section.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
