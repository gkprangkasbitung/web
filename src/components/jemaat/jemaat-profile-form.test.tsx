import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { emptyJemaatProfile, JemaatProfileForm, type JemaatProfileValues } from "./jemaat-profile-form";

const WILAYAH_UTARA = { id: "11111111-1111-1111-1111-111111111111", nama: "Wilayah Utara" };
const WILAYAH_OPTIONS = [WILAYAH_UTARA];

function Harness({ initial }: { initial: JemaatProfileValues }) {
  const [values, setValues] = useState(initial);
  return (
    <JemaatProfileForm
      formId="form"
      values={values}
      onValuesChange={setValues}
      wilayahOptions={WILAYAH_OPTIONS}
      keluargaSuggestions={[]}
      labelOptions={[]}
      onSubmit={vi.fn()}
    />
  );
}

describe("JemaatProfileForm", () => {
  it("shows labels (not raw keys or the wilayah UUID) for an edit form opened with saved data", () => {
    render(
      <Harness
        initial={{
          ...emptyJemaatProfile(),
          jenisKelamin: "laki_laki",
          statusKeanggotaan: "sidi",
          wilayahId: WILAYAH_UTARA.id,
        }}
      />,
    );

    const jenisKelamin = screen.getByLabelText("Jenis Kelamin");
    const status = screen.getByLabelText("Status Keanggotaan");
    const wilayah = screen.getByLabelText("Wilayah");

    expect(jenisKelamin).toHaveTextContent("Laki-laki");
    expect(status).toHaveTextContent("Sidi");
    expect(wilayah).toHaveTextContent("Wilayah Utara");
    expect(wilayah).not.toHaveTextContent(WILAYAH_UTARA.id);
  });

  it("shows a clear fallback, not the raw UUID, for a wilayah that no longer exists", () => {
    render(<Harness initial={{ ...emptyJemaatProfile(), wilayahId: "deleted-wilayah-id" }} />);

    const wilayah = screen.getByLabelText("Wilayah");
    expect(wilayah).toHaveTextContent("Tidak ditemukan");
    expect(wilayah).not.toHaveTextContent("deleted-wilayah-id");
  });

  it("switches the trigger to the picked option's label, not its key", async () => {
    const user = userEvent.setup();
    render(<Harness initial={emptyJemaatProfile()} />);

    await user.click(screen.getByLabelText("Jenis Kelamin"));
    await user.click(await screen.findByRole("option", { name: "Perempuan" }));

    expect(screen.getByLabelText("Jenis Kelamin")).toHaveTextContent("Perempuan");
  });
});
