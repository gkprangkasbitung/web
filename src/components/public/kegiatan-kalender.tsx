"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { addMonths, formatMonthLong, monthOf, type IsoDate, type IsoMonth } from "@/lib/dates";
import { agendaFromCells, buildMonthCells } from "@/lib/kegiatan-kalender";
import { kategoriDotColor } from "@/lib/kegiatan-kategori";
import type { PublicKegiatanBulanRow } from "@/lib/public-kegiatan";

import { KegiatanAgendaList } from "./kegiatan-agenda-list";
import { KegiatanMonthGrid } from "./kegiatan-month-grid";

export type KegiatanKalenderProps = {
  bulan: IsoMonth;
  events: PublicKegiatanBulanRow[];
  legend: { nama: string; warna: string }[];
  today: IsoDate;
};

/** `/kegiatan` (brief §14.4): month navigation (real links, shareable/back-able), a category legend, and Bulan/Daftar tabs. */
export function KegiatanKalender({ bulan, events, legend, today }: KegiatanKalenderProps) {
  const cells = buildMonthCells(bulan, events, today);
  const todayBulan = monthOf(today);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            nativeButton={false}
            render={<Link href={`/kegiatan?bulan=${addMonths(bulan, -1)}`} aria-label="Bulan sebelumnya" />}
          >
            <ChevronLeftIcon aria-hidden />
          </Button>
          <h2 className="min-w-[200px] text-center font-serif text-2xl sm:text-3xl">{formatMonthLong(bulan)}</h2>
          <Button
            variant="outline"
            size="icon"
            nativeButton={false}
            render={<Link href={`/kegiatan?bulan=${addMonths(bulan, 1)}`} aria-label="Bulan berikutnya" />}
          >
            <ChevronRightIcon aria-hidden />
          </Button>
          {bulan !== todayBulan && (
            <Button variant="outline" nativeButton={false} render={<Link href={`/kegiatan?bulan=${todayBulan}`} />}>
              Hari ini
            </Button>
          )}
        </div>
      </div>

      {legend.length > 0 && (
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          {legend.map((item) => (
            <span key={item.nama} className="flex items-center gap-2">
              <span aria-hidden className="size-2.5 rounded-sm" style={{ backgroundColor: kategoriDotColor(item.warna) }} />
              {item.nama}
            </span>
          ))}
        </div>
      )}

      <Tabs defaultValue="bulan">
        <TabsList aria-label="Tampilan" className="w-fit">
          <TabsTrigger value="bulan">Bulan</TabsTrigger>
          <TabsTrigger value="daftar">Daftar</TabsTrigger>
        </TabsList>
        <TabsContent value="bulan" className="pt-6">
          <KegiatanMonthGrid bulan={bulan} events={events} today={today} />
        </TabsContent>
        <TabsContent value="daftar" className="pt-6">
          <KegiatanAgendaList days={agendaFromCells(cells)} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
