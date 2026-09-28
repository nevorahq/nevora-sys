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

afterEach(cleanup);

describe("auth header controls", () => {
  it("language toggle в iconOnly-режиме не показывает текст", () => {
    render(<LanguageSwitcher locale="ru" iconOnly />);
    const trigger = screen.getByRole("button", { name: "Language: Русский" });
    expect(trigger.textContent).toBe("");
    expect(trigger.getAttribute("title")).toBe("Language: Русский");
  });
});
