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

describe("PortalLoginForm, username tab (the default, brief §18.7)", () => {
  it("submits username, password, cara, and next, and shows the server's error", async () => {
    portalLogin.mockResolvedValue({
      error: "Username atau password salah.",
      cara: "username",
      username: "yohanes.santoso",
      email: "",
    } satisfies PortalLoginState);
    const user = userEvent.setup();
    render(<PortalLoginForm next="/jemaat/profil" cara="username" />);

    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    const username = screen.getByLabelText("Username");
    expect(username).toHaveAttribute("autocomplete", "username");
    expect(username).toHaveAttribute("autocapitalize", "none");
    await user.type(username, "yohanes.santoso");
    await user.type(screen.getByLabelText("Password"), "rahasia123");
    await user.click(screen.getByRole("button", { name: "Masuk" }));

    const form = portalLogin.mock.calls[0]![1] as FormData;
    expect(form.get("cara")).toBe("username");
    expect(form.get("username")).toBe("yohanes.santoso");
    expect(form.get("password")).toBe("rahasia123");
    expect(form.get("next")).toBe("/jemaat/profil");
    expect(await screen.findByRole("alert")).toHaveTextContent("Username atau password salah.");
    expect(screen.getByLabelText("Username")).toHaveValue("yohanes.santoso");
  });

  it("the password field starts hidden and toggles with the eye button", async () => {
    const user = userEvent.setup();
    render(<PortalLoginForm next="/jemaat" cara="username" />);

    const password = screen.getByLabelText("Password");
    expect(password).toHaveAttribute("type", "password");
    const toggle = screen.getByRole("button", { name: "Tampilkan password" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    await user.click(toggle);
    expect(password).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Sembunyikan password" })).toHaveAttribute("aria-pressed", "true");
  });

  it("links to Kontak for jemaat with no account yet, or who forgot their password", () => {
    render(<PortalLoginForm next="/jemaat" cara="username" />);
    expect(screen.getByRole("link", { name: "Hubungi sekretariat" })).toHaveAttribute("href", "/kontak");
  });
});

describe("PortalLoginForm, email tab", () => {
  it("submits email, password, and cara=email", async () => {
    portalLogin.mockResolvedValue({
      error: "Email atau password salah.",
      cara: "email",
      username: "",
      email: "anggota@contoh.test",
    } satisfies PortalLoginState);
    const user = userEvent.setup();
    render(<PortalLoginForm next="/jemaat" cara="email" />);

    expect(screen.queryByLabelText("Username")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Email"), "anggota@contoh.test");
    await user.type(screen.getByLabelText("Password"), "rahasia123");
    await user.click(screen.getByRole("button", { name: "Masuk" }));

    const form = portalLogin.mock.calls[0]![1] as FormData;
    expect(form.get("cara")).toBe("email");
    expect(form.get("email")).toBe("anggota@contoh.test");
    expect(await screen.findByRole("alert")).toHaveTextContent("Email atau password salah.");
  });
});
