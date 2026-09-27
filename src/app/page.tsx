// TODO(tahap 9): the public site (header, hero with this week's services,
// latest warta, footer) is built in stage 9, per brief §8. This page is only a
// placeholder so the app has a root route during the foundation stage.
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-2 p-4 md:p-8">
      <h1 className="text-2xl font-semibold tracking-tight">GKP Rangkasbitung</h1>
      {/* TODO: real Beranda content (brief §8, §12.4). */}
      <p className="text-sm text-muted-foreground">TODO: konten Beranda.</p>
    </main>
  );
}
