// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { en } from "@/shared/i18n/dictionaries/en";

vi.mock("../actions/login.action", () => ({ loginAction: vi.fn() }));
vi.mock("../actions/register.action", () => ({ registerAction: vi.fn() }));

import { LoginForm } from "./login-form";
import { RegisterForm } from "./register-form";

afterEach(cleanup);

describe("product destination through auth forms", () => {
  it("login сохраняет Finance в hidden input и ссылке на регистрацию", () => {
    const { container } = render(<LoginForm dict={en} destination="/finance" />);
    const destination = container.querySelector<HTMLInputElement>('input[name="next"]');
    expect(destination?.value).toBe("/finance");
    expect(screen.getByRole("link", { name: en.auth.login.registerLink }).getAttribute("href"))
      .toBe("/register?next=%2Ffinance");
  });

  it("register сохраняет Subscriptions в hidden input и ссылке на login", () => {
    const { container } = render(
      <RegisterForm dict={en} destination="/subscriptions" />,
    );
    const destination = container.querySelector<HTMLInputElement>('input[name="next"]');
    expect(destination?.value).toBe("/subscriptions");
    expect(screen.getByRole("link", { name: en.auth.register.loginLink }).getAttribute("href"))
      .toBe("/login?next=%2Fsubscriptions");
  });
});
