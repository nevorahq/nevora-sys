// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HeaderActions } from "./header-actions";

afterEach(cleanup);

function renderActions() {
  render(
    <HeaderActions label="Actions">
      <button type="button">Notifications</button>
      <button type="button">Language</button>
      <button type="button">Theme</button>
      <button type="button">Sign out</button>
    </HeaderActions>,
  );
}

describe("HeaderActions", () => {
  it("keeps mobile actions closed until the adaptive trigger is pressed", async () => {
    const user = userEvent.setup();
    renderActions();

    const root = screen.getByTestId("header-actions");
    const trigger = screen.getByRole("button", { name: "Actions" });
    expect(root.getAttribute("data-state")).toBe("closed");
    expect(root.className).toContain("w-9");
    expect(trigger.className).not.toContain("hidden");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    await user.click(trigger);

    expect(root.getAttribute("data-state")).toBe("open");
    expect(root.style.getPropertyValue("--header-actions-width")).toBe("212px");
    expect(root.className).toContain("w-[var(--header-actions-width)]");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("reveals the current order from right to left over the 300ms motion", async () => {
    const user = userEvent.setup();
    renderActions();

    await user.click(screen.getByRole("button", { name: "Actions" }));
    const items = screen.getAllByTestId("header-action-item");

    expect(items.map((item) => item.textContent)).toEqual([
      "Notifications",
      "Language",
      "Theme",
      "Sign out",
    ]);
    expect(items.map((item) => item.style.transitionDelay)).toEqual([
      "135ms",
      "90ms",
      "45ms",
      "0ms",
    ]);
    expect(items.every((item) => item.className.includes("duration-300"))).toBe(true);
    expect(items.every((item) => !item.className.includes("lg:visible"))).toBe(true);
  });

  it("closes on Escape and restores focus to the trigger", async () => {
    const user = userEvent.setup();
    renderActions();
    const trigger = screen.getByRole("button", { name: "Actions" });

    await user.click(trigger);
    await user.keyboard("{Escape}");

    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });
});
