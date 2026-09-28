// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/shared/i18n/set-locale.action", () => ({
  setLocaleAction: vi.fn(),
}));

import { LanguageSwitcher } from "./language-switcher";
import { ThemeToggle } from "./theme-toggle";
import { en } from "@/shared/i18n/dictionaries/en";
import { ru } from "@/shared/i18n/dictionaries/ru";

afterEach(cleanup);

describe("auth header controls", () => {
  it("language toggle в iconOnly-режиме не показывает текст", () => {
    render(<LanguageSwitcher locale="ru" labels={en.controls} iconOnly />);
    const trigger = screen.getByRole("button", { name: "Language: Русский" });
    expect(trigger.textContent).toBe("");
    expect(trigger.getAttribute("title")).toBe("Language: Русский");
  });

  it("labels the language switcher in the viewer's language", () => {
    render(<LanguageSwitcher locale="ru" labels={ru.controls} iconOnly />);
    expect(screen.getByRole("button", { name: "Язык: Русский" })).toBeDefined();
  });

  it("labels the theme toggle in the viewer's language", () => {
    render(<ThemeToggle labels={ru.controls} />);
    expect(screen.getByRole("button", { name: "Включить тёмную тему" })).toBeDefined();
  });
});
