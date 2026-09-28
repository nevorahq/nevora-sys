// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PriorityBadge } from "./priority-badge";

afterEach(cleanup);

describe("PriorityBadge", () => {
  it("keeps the label for screen readers and as a tooltip when only the dot shows", () => {
    render(<PriorityBadge priority="high" label="Высокий" />);

    const label = screen.getByText("Высокий");
    expect(label.className).toContain("sr-only");
    expect(label.className).toContain("md:not-sr-only");
    expect(label.closest("[title]")?.getAttribute("title")).toBe("Высокий");
  });

  it("colours the dot by priority", () => {
    const { container } = render(<PriorityBadge priority="critical" label="Critical" />);
    expect(container.querySelector("[aria-hidden='true']")?.className).toContain("bg-danger");
  });
});
