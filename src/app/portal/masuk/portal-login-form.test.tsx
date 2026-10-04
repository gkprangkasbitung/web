import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PortalLoginState } from "./actions";

const portalLogin = vi.hoisted(() => vi.fn());
vi.mock("./actions", () => ({ portalLogin }));

const { PortalLoginForm } = await import("./portal-login-form");

const CODE_STEP: PortalLoginState = {
  step: "code",
  email: "anggota@contoh.test",
  error: null,
  notice: "Jika email terdaftar, kode masuk telah dikirim.",
  cooldown: 60,
  nonce: 1,
};

afterEach(() => {
  vi.useRealTimers();
  portalLogin.mockReset();
});

describe("PortalLoginForm (stage 11f)", () => {
  it("sends the email with intent=send, then shows the code step with the same notice for any email", async () => {
    portalLogin.mockResolvedValue(CODE_STEP);
    const user = userEvent.setup();
    render(<PortalLoginForm next="/jemaat" linkExpired={false} />);

    await user.type(screen.getByLabelText("Email"), "anggota@contoh.test");
    await user.click(screen.getByRole("button", { name: "Kirim kode masuk" }));

    const form = portalLogin.mock.calls[0]![1] as FormData;
    expect(form.get("intent")).toBe("send");
    expect(form.get("email")).toBe("anggota@contoh.test");

    expect(await screen.findByRole("heading", { name: "Cek email Anda" })).toBeInTheDocument();
    expect(screen.getByText(/Jika email terdaftar, kode masuk telah dikirim\./)).toBeInTheDocument();
    const code = screen.getByLabelText("Kode masuk");
    expect(code).toHaveAttribute("inputmode", "numeric");
    expect(code).toHaveAttribute("autocomplete", "one-time-code");
    expect(code).toHaveAttribute("maxlength", "6");
  });

  it("counts down 60 seconds before offering Kirim ulang", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    portalLogin.mockResolvedValue(CODE_STEP);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<PortalLoginForm next="/jemaat" linkExpired={false} />);
    await user.type(screen.getByLabelText("Email"), "anggota@contoh.test");
    await user.click(screen.getByRole("button", { name: "Kirim kode masuk" }));

    expect(await screen.findByText("Kirim ulang dalam 1:00")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Kirim ulang kode" })).not.toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });
    expect(screen.getByText("Kirim ulang dalam 0:45")).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(46_000);
    });
    expect(screen.getByRole("button", { name: "Kirim ulang kode" })).toBeInTheDocument();
  });

  it("verifies with the email, code, and next; Enter in the code field submits Masuk", async () => {
    portalLogin.mockResolvedValueOnce(CODE_STEP).mockResolvedValueOnce({
      ...CODE_STEP,
      error: "Kode salah atau sudah kedaluwarsa. Periksa kembali kodenya, atau kirim ulang kode baru.",
      nonce: 2,
    });
    const user = userEvent.setup();
    render(<PortalLoginForm next="/jemaat/profil" linkExpired={false} />);
    await user.type(screen.getByLabelText("Email"), "anggota@contoh.test");
    await user.click(screen.getByRole("button", { name: "Kirim kode masuk" }));

    await user.type(await screen.findByLabelText("Kode masuk"), "123456{Enter}");
    const form = portalLogin.mock.calls[1]![1] as FormData;
    expect(form.get("intent")).toBe("verify");
    expect(form.get("code")).toBe("123456");
    expect(form.get("email")).toBe("anggota@contoh.test");
    expect(form.get("next")).toBe("/jemaat/profil");
    expect(await screen.findByRole("alert")).toHaveTextContent("Kode salah atau sudah kedaluwarsa.");
  });
});
