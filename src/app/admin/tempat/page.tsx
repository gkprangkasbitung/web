import type { Metadata } from "next";

import { MasterDataPage } from "@/components/master-data/master-data-page";
import { TEMPAT } from "@/lib/master-data";

export const metadata: Metadata = { title: "Tempat" };

export default function Page() {
  return <MasterDataPage config={TEMPAT} />;
}
