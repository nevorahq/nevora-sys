// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DeveloperAccessBadge } from "./developer-access-badge";

describe("DeveloperAccessBadge", () => {
  it("shows a persistent developer and unlimited access indicator", () => {
    render(<DeveloperAccessBadge />);

    const badge = screen.getByTestId("developer-access-badge");
    expect(badge.textContent).toContain("Developer");
    expect(badge.textContent).toContain("Unlimited");
    expect(badge.getAttribute("href")).toBe("/dashboard/settings/billing");
  });
});
