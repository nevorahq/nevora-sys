// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { en } from "@/shared/i18n/dictionaries/en";
import type { Subscription } from "@nevora/subscriptions-contracts";
import { RenewalInbox } from "./renewal-inbox";

const refresh = vi.fn();
const deleteSubscriptionAction = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("../actions/delete-subscription.action", () => ({
  deleteSubscriptionAction: (...args: unknown[]) => deleteSubscriptionAction(...args),
}));

vi.mock("./renewal-decision-actions", () => ({
  RenewalDecisionActions: () => null,
}));

const subscription = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Figma",
  amount: 15,
  currency: "USD",
  billing_cycle: "monthly",
  category: "productivity",
  next_billing_date: "2026-09-10",
  url: null,
  note: null,
  is_active: true,
  auto_renews: true,
  renewal_reminder_days: 7,
  created_at: "2026-08-22T00:00:00.000Z",
  updated_at: "2026-08-22T00:00:00.000Z",
} as Subscription;

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

beforeEach(() => {
  refresh.mockReset();
  deleteSubscriptionAction.mockReset().mockResolvedValue({});
});

afterEach(cleanup);

function renderInbox(canDelete = true) {
  render(
    <RenewalInbox
      items={[]}
      subscriptions={[subscription]}
      dict={en}
      canWrite
      canDelete={canDelete}
    />,
  );
}

describe("RenewalInbox subscription deletion", () => {
  it("shows an icon-only delete action only in the All filter", async () => {
    const user = userEvent.setup();
    renderInbox();

    expect(screen.queryByRole("button", { name: "Delete: Figma" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "All" }));

    const trigger = screen.getByRole("button", { name: "Delete: Figma" });
    expect(trigger.textContent).toBe("");
    expect(trigger.querySelector("svg")).not.toBeNull();
  });

  it("requires confirmation before deleting and refreshes after success", async () => {
    const user = userEvent.setup();
    renderInbox();

    await user.click(screen.getByRole("button", { name: "All" }));
    await user.click(screen.getByRole("button", { name: "Delete: Figma" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Delete “Figma”?" )).toBeTruthy();
    expect(deleteSubscriptionAction).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleteSubscriptionAction).toHaveBeenCalledWith(subscription.id));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("does not expose deletion without data.delete permission", async () => {
    const user = userEvent.setup();
    renderInbox(false);

    await user.click(screen.getByRole("button", { name: "All" }));
    expect(screen.queryByRole("button", { name: "Delete: Figma" })).toBeNull();
  });
});
