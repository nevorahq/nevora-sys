// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/shared/i18n/set-locale.action", () => ({
  setLocaleAction: vi.fn(),
}));

import { LanguageSwitcher } from "./language-switcher";
import { ProductEntryMenu } from "./product-entry-menu";

afterEach(cleanup);

describe("auth header controls", () => {
  it("login product menu остаётся на login и меняет next", async () => {
    render(
      <ProductEntryMenu
        locale="ru"
        authRoute="/login"
        currentDestination="/finance"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Выбрать приложение" }));

    expect(screen.getByRole("menuitem", { name: "Задачи" }).getAttribute("href"))
      .toBe("/login?next=%2Ftasks");
    expect(screen.getByRole("menuitem", { name: "Финансы" }).getAttribute("aria-current"))
      .toBe("page");
    expect(screen.getByRole("menuitem", { name: "Подписки" }).getAttribute("href"))
      .toBe("/login?next=%2Fsubscriptions");
  });

  it("register product menu остаётся на register", async () => {
    render(
      <ProductEntryMenu
        locale="en"
        authRoute="/register"
        currentDestination="/tasks"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Choose an application" }));
    expect(screen.getByRole("menuitem", { name: "Finance" }).getAttribute("href"))
      .toBe("/register?next=%2Ffinance");
  });

  it("language toggle в iconOnly-режиме не показывает текст", () => {
    render(<LanguageSwitcher locale="ru" iconOnly />);
    const trigger = screen.getByRole("button", { name: "Language: Русский" });
    expect(trigger.textContent).toBe("");
    expect(trigger.getAttribute("title")).toBe("Language: Русский");
  });
});
