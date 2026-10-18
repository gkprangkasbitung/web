"use client";

import { CircleAlertIcon, DownloadIcon, FileTextIcon, Loader2Icon, MinusIcon, PlusIcon, RefreshCwIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatTimeWib } from "@/lib/dates";
import { WARTA_DOCX_STALE, type WartaDocxPreview } from "@/lib/warta-docx";

const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 2] as const;
const GENERIC_ERROR = "Terjadi kesalahan di server. Coba lagi.";
const OFFLINE = "Tidak dapat terhubung ke server. Periksa koneksi internet, lalu coba lagi.";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; preview: WartaDocxPreview };

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function fileNameFrom(disposition: string | null): string {
  return /filename="([^"]+)"/.exec(disposition ?? "")?.[1] ?? "warta.docx";
}

async function errorFrom(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return payload?.error ?? GENERIC_ERROR;
}

/**
 * "Pratinjau Warta" (brief §16.3): a full-screen dialog that renders the
 * generated .docx page by page with docx-preview (loaded only when the dialog
 * opens, never in the editor's initial bundle), a zoom control, and a side
 * panel with "Kelengkapan Warta" and the build time. "Unduh Warta (.docx)"
 * lives only here, and downloads exactly the data this preview showed: the
 * server answers 409 when the warta changed since.
 */
export function WartaDocxPreviewDialog({ wartaId }: { wartaId: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ status: "loading" });
  const [zoom, setZoom] = useState(1);
  const [downloading, setDownloading] = useState(false);
  const [stale, setStale] = useState(false);
  const pagesRef = useRef<HTMLDivElement>(null);
  const focusAfterClose = useRef<HTMLElement | null>(null);
  const request = useRef(0);

  const load = useCallback(async () => {
    const id = ++request.current;
    setState({ status: "loading" });
    setStale(false);
    try {
      const response = await fetch(`/api/admin/warta/${wartaId}/docx?mode=preview`, { cache: "no-store" });
      if (!response.ok) throw new Error(await errorFrom(response));
      const { data } = (await response.json()) as { data: WartaDocxPreview };
      if (id === request.current) setState({ status: "ready", preview: data });
    } catch (error) {
      const message = error instanceof TypeError ? OFFLINE : error instanceof Error ? error.message : GENERIC_ERROR;
      if (id === request.current) setState({ status: "error", message });
    }
  }, [wartaId]);

  // Renders the pages once the preview is in and the container is mounted.
  const preview = state.status === "ready" ? state.preview : null;
  useEffect(() => {
    const container = pagesRef.current;
    if (!preview || !container) return;
    let cancelled = false;
    (async () => {
      try {
        const { renderAsync } = await import("docx-preview");
        if (cancelled) return;
        container.replaceChildren();
        await renderAsync(new Blob([base64ToBytes(preview.docx)]), container, undefined, {
          className: "docx",
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          breakPages: true,
          renderHeaders: true,
          renderFooters: true,
          useBase64URL: true,
        });
      } catch (error) {
        console.error("[warta-docx] preview render failed:", error);
        if (!cancelled) setState({ status: "error", message: "Pratinjau tidak bisa ditampilkan. Coba muat ulang." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [preview]);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      focusAfterClose.current = null;
      void load();
    }
  }

  async function download() {
    if (!preview || downloading) return;
    setDownloading(true);
    try {
      const response = await fetch(`/api/admin/warta/${wartaId}/docx?mode=download&hash=${preview.hash}`, { cache: "no-store" });
      if (response.status === 409) {
        setStale(true);
        toast.error(await errorFrom(response));
        return;
      }
      if (!response.ok) throw new Error(await errorFrom(response));
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = fileNameFrom(response.headers.get("Content-Disposition"));
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      toast.success("Warta diunduh");
    } catch (error) {
      toast.error(error instanceof TypeError ? OFFLINE : error instanceof Error ? error.message : GENERIC_ERROR);
    } finally {
      setDownloading(false);
    }
  }

  /** A Kelengkapan link to an editor section: close, then focus (and scroll to) that section. */
  function goToSection(event: React.MouseEvent, href: string) {
    const target = document.getElementById(href.slice(1));
    if (!target) return;
    event.preventDefault();
    focusAfterClose.current = target;
    setOpen(false);
  }

  const zoomIndex = ZOOM_STEPS.indexOf(zoom as (typeof ZOOM_STEPS)[number]);

  return (
    <>
      <Button variant="outline" onClick={() => onOpenChange(true)}>
        <FileTextIcon aria-hidden />
        Pratinjau Warta
      </Button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none p-0 sm:max-w-none"
          finalFocus={() => focusAfterClose.current ?? true}
        >
          <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3 pr-12 sm:px-6">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <DialogTitle>Pratinjau Warta</DialogTitle>
              <DialogDescription>Tampilan halaman sesuai file .docx yang akan diunduh.</DialogDescription>
            </div>
            <div className="flex items-center gap-1" role="group" aria-label="Zoom">
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Perkecil"
                disabled={zoomIndex <= 0}
                onClick={() => setZoom(ZOOM_STEPS[Math.max(0, zoomIndex - 1)]!)}
              >
                <MinusIcon aria-hidden />
              </Button>
              <Button variant="ghost" size="sm" className="w-16 font-mono tabular-nums" onClick={() => setZoom(1)} aria-label="Zoom 100%">
                {Math.round(zoom * 100)}%
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Perbesar"
                disabled={zoomIndex >= ZOOM_STEPS.length - 1}
                onClick={() => setZoom(ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, zoomIndex + 1)]!)}
              >
                <PlusIcon aria-hidden />
              </Button>
            </div>
            <Button variant="outline" onClick={() => void load()} disabled={state.status === "loading"}>
              <RefreshCwIcon aria-hidden />
              Muat ulang pratinjau
            </Button>
            <Button onClick={download} disabled={!preview || downloading || stale} focusableWhenDisabled>
              {downloading ? <Loader2Icon aria-hidden className="motion-safe:animate-spin" /> : <DownloadIcon aria-hidden />}
              Unduh Warta (.docx)
            </Button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <div className="min-h-0 flex-1 overflow-auto bg-muted" aria-busy={state.status === "loading"}>
              {state.status === "error" && (
                <div className="p-6">
                  <Alert variant="destructive">
                    <CircleAlertIcon aria-hidden="true" />
                    <AlertTitle>Pratinjau gagal dimuat</AlertTitle>
                    <AlertDescription>{state.message}</AlertDescription>
                  </Alert>
                </div>
              )}
              {state.status === "loading" && (
                <div className="mx-auto flex max-w-2xl flex-col gap-4 p-6" aria-label="Memuat pratinjau">
                  <Skeleton className="h-[60vh] w-full" />
                </div>
              )}
              {state.status === "ready" && (
                <div
                  ref={pagesRef}
                  style={{ zoom }}
                  className="[&_.docx-wrapper]:bg-transparent! [&_.docx-wrapper]:p-6! [&_.docx-wrapper>section]:shadow-md!"
                />
              )}
            </div>

            <aside className="flex max-h-[40dvh] w-full shrink-0 flex-col gap-4 overflow-auto border-t p-4 lg:max-h-none lg:w-80 lg:border-t-0 lg:border-l">
              {stale && (
                <Alert variant="destructive">
                  <CircleAlertIcon aria-hidden="true" />
                  <AlertTitle>Data berubah</AlertTitle>
                  <AlertDescription>{WARTA_DOCX_STALE}</AlertDescription>
                </Alert>
              )}
              <section aria-labelledby="kelengkapan-warta" className="flex flex-col gap-2">
                <h3 id="kelengkapan-warta" className="text-sm font-semibold">
                  Kelengkapan Warta
                </h3>
                {preview === null ? (
                  <Skeleton className="h-24 w-full" />
                ) : preview.kelengkapan.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Semua data warta sudah terisi.</p>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Bagian berikut masih kosong. Warta tetap bisa diunduh.
                    </p>
                    <ul className="flex flex-col gap-2 text-sm">
                      {preview.kelengkapan.map((item) => (
                        <li key={`${item.href}|${item.pesan}`}>
                          {item.href.startsWith("#") ? (
                            <a
                              href={item.href}
                              onClick={(event) => goToSection(event, item.href)}
                              className="underline-offset-4 hover:underline"
                            >
                              {item.pesan}
                            </a>
                          ) : (
                            <Link href={item.href} className="underline-offset-4 hover:underline">
                              {item.pesan}
                            </Link>
                          )}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>
              {preview && (
                <p className="text-xs text-muted-foreground">
                  Dibuat pukul <span className="font-mono tabular-nums">{formatTimeWib(preview.dibuatPada)}</span> WIB
                </p>
              )}
            </aside>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
