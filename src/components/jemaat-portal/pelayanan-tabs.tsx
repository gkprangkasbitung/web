"use client";

import { PelayananList } from "@/components/jemaat-portal/pelayanan-list";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PelayananSaya } from "@/lib/portal/types";

/**
 * "Akan datang" (next 60 days) and "Riwayat" (previous 90 days, newest
 * first) — both ranges are loaded once on the server and simply switched
 * here (brief: no client-side fetch).
 */
export function PelayananTabs({ akanDatang, riwayat }: { akanDatang: PelayananSaya[]; riwayat: PelayananSaya[] }) {
  return (
    <Tabs defaultValue="akan-datang">
      <TabsList className="h-auto w-full gap-1 p-1 sm:w-fit">
        <TabsTrigger value="akan-datang" className="min-h-11 flex-1 px-4 text-base sm:flex-none">
          Akan Datang
        </TabsTrigger>
        <TabsTrigger value="riwayat" className="min-h-11 flex-1 px-4 text-base sm:flex-none">
          Riwayat
        </TabsTrigger>
      </TabsList>
      <TabsContent value="akan-datang" className="pt-5">
        <PelayananList rows={akanDatang} emptyText="Tidak ada jadwal pelayanan dalam 60 hari ke depan." />
      </TabsContent>
      <TabsContent value="riwayat" className="pt-5">
        <PelayananList rows={riwayat} emptyText="Tidak ada riwayat pelayanan dalam 90 hari terakhir." order="desc" />
      </TabsContent>
    </Tabs>
  );
}
