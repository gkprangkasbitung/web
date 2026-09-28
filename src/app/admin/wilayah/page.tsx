import type { Metadata } from "next";

import { MasterDataPage } from "@/components/master-data/master-data-page";
import { WILAYAH } from "@/lib/master-data";

export const metadata: Metadata = { title: "Wilayah" };

export default function Page() {
  return <MasterDataPage config={WILAYAH} />;
}
