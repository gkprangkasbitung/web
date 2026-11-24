import { describe, expect, it } from "vitest";

import { hasilKeCsv } from "./ekspor";
import type { HasilKandidat } from "./types";

const row = (over: Partial<HasilKandidat>): HasilKandidat => ({
  kontes: "penatua",
  kontesNama: "Penatua (Majelis Jemaat)",
  jemaatId: "a",
  namaTampilan: "Bpk. Adi",
  jumlahSuara: 3,
  peringkat: 1,
  ...over,
});

describe("hasilKeCsv", () => {
  it("writes one row per candidate per contest, in hasil_suara's order, marking ties", () => {
    const csv = hasilKeCsv([
      row({}),
      row({ jemaatId: "b", namaTampilan: "Ibu Budi", jumlahSuara: 2, peringkat: 2 }),
      row({ jemaatId: "c", namaTampilan: "Sdr. Citra", jumlahSuara: 2, peringkat: 2 }),
      row({ kontes: "ppj", kontesNama: "PPJ (Pengawas Perbendaharaan Jemaat)", jumlahSuara: 0, peringkat: 1 }),
    ]);
    expect(csv.split("\r\n")).toEqual([
      '"Kontes","Peringkat","Nama","Jumlah Suara","Seri"',
      '"Penatua (Majelis Jemaat)","1","Bpk. Adi","3",""',
      '"Penatua (Majelis Jemaat)","2","Ibu Budi","2","Seri"',
      '"Penatua (Majelis Jemaat)","2","Sdr. Citra","2","Seri"',
      '"PPJ (Pengawas Perbendaharaan Jemaat)","1","Bpk. Adi","0",""',
    ]);
  });

  it("escapes names that look like formulas (CSV injection) and quotes", () => {
    const csv = hasilKeCsv([row({ namaTampilan: '=HYPERLINK("http://x")' }), row({ jemaatId: "b", namaTampilan: "@Budi", peringkat: 2 })]);
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(csv).toContain(`"'@Budi"`);
  });
});
