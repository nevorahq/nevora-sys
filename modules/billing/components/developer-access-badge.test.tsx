// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DeveloperAccessBadge } from "./developer-access-badge";

describe("DeveloperAccessBadge", () => {
  it("shows an icon-only developer status with an accessible label", () => {
    render(<DeveloperAccessBadge />);

    const badge = screen.getByTestId("developer-access-badge");
    expect(badge.textContent).toBe("");
    expect(badge.getAttribute("aria-label")).toBe("Developer Access · Unlimited product limits");
    expect(badge.getAttribute("title")).toBe("Developer Access · Unlimited product limits");
    expect(badge.getAttribute("href")).toBe("/settings/billing");
    expect(badge.className).toContain("bg-transparent");
    expect(badge.className).toContain("text-violet-600");
  });
});
