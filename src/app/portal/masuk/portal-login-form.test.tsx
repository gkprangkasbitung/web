import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PortalLoginState } from "./actions";

const portalLogin = vi.hoisted(() => vi.fn());
vi.mock("./actions", () => ({ portalLogin }));

const { PortalLoginForm } = await import("./portal-login-form");

afterEach(() => {
  portalLogin.mockReset();
});

describe("PortalLoginForm (email + password)", () => {
  it("submits email, password, and next, and shows the server's error", async () => {
    portalLogin.mockResolvedValue({ error: "Email atau password salah.", email: "anggota@contoh.test" } satisfies PortalLoginState);
    const user = userEvent.setup();
    render(<PortalLoginForm next="/jemaat/profil" />);

    await user.type(screen.getByLabelText("Email"), "anggota@contoh.test");
    await user.type(screen.getByLabelText("Password"), "rahasia123");
    await user.click(screen.getByRole("button", { name: "Masuk" }));

    const form = portalLogin.mock.calls[0]![1] as FormData;
    expect(form.get("email")).toBe("anggota@contoh.test");
    expect(form.get("password")).toBe("rahasia123");
    expect(form.get("next")).toBe("/jemaat/profil");
    expect(await screen.findByRole("alert")).toHaveTextContent("Email atau password salah.");
  });

  it("the password field starts hidden and toggles with the eye button", async () => {
    const user = userEvent.setup();
    render(<PortalLoginForm next="/jemaat" />);

    const password = screen.getByLabelText("Password");
    expect(password).toHaveAttribute("type", "password");
    const toggle = screen.getByRole("button", { name: "Tampilkan password" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    await user.click(toggle);
    expect(password).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Sembunyikan password" })).toHaveAttribute("aria-pressed", "true");
  });

  it("links to Kontak for jemaat with no account yet, or who forgot their password", () => {
    render(<PortalLoginForm next="/jemaat" />);
    expect(screen.getByRole("link", { name: "Hubungi sekretariat" })).toHaveAttribute("href", "/kontak");
  });
});
