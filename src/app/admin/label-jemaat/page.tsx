import type { Metadata } from "next";

import { MasterDataPage } from "@/components/master-data/master-data-page";
import { LABEL_JEMAAT } from "@/lib/master-data";

export const metadata: Metadata = { title: "Label Jemaat" };

export default function Page() {
  return <MasterDataPage config={LABEL_JEMAAT} />;
}
