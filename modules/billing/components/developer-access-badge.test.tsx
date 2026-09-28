// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DeveloperAccessBadge } from "./developer-access-badge";
import { en } from "@/shared/i18n/dictionaries/en";
import { ru } from "@/shared/i18n/dictionaries/ru";

describe("DeveloperAccessBadge", () => {
  it("shows an icon-only developer status with an accessible label", () => {
    render(<DeveloperAccessBadge label={en.controls.developerAccess} />);

    const badge = screen.getByTestId("developer-access-badge");
    expect(badge.textContent).toBe("");
    expect(badge.getAttribute("aria-label")).toBe("Developer Access · Unlimited product limits");
    expect(badge.getAttribute("title")).toBe("Developer Access · Unlimited product limits");
    expect(badge.getAttribute("href")).toBe("/settings/billing");
    expect(badge.className).toContain("bg-transparent");
    expect(badge.className).toContain("text-violet-600");
  });

  it("takes its label from the viewer's dictionary", () => {
    render(<DeveloperAccessBadge label={ru.controls.developerAccess} />);
    expect(screen.getAllByTestId("developer-access-badge").at(-1)?.getAttribute("aria-label")).toBe(
      "Доступ разработчика · Лимиты тарифа сняты",
    );
  });
});
