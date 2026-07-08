// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const selectFirstActionAction = vi.fn(async () => ({}) as { error?: string });

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("../actions/select-first-action.action", () => ({ selectFirstActionAction }));

const { FirstActionCta } = await import("./first-action-cta");

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("FirstActionCta", () => {
  it("records the first action before navigating — the CTA is a guided flow, not a link", async () => {
    render(<FirstActionCta action="upload_document" label="Upload a document" />);

    await userEvent.click(screen.getByRole("button"));

    // `source` is what makes the B7 empty-state CTA rate computable.
    await waitFor(() =>
      expect(selectFirstActionAction).toHaveBeenCalledWith({ firstAction: "upload_document", source: "empty_state" }),
    );
    expect(push).toHaveBeenCalledWith("/dashboard/documents/new");
  });

  it("opens the on-page modal instead of navigating to the page the user is on", async () => {
    const onActivate = vi.fn();
    render(<FirstActionCta action="add_subscription" label="Add a subscription" onActivate={onActivate} />);

    await userEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(onActivate).toHaveBeenCalledTimes(1));
    expect(selectFirstActionAction).toHaveBeenCalledWith({ firstAction: "add_subscription", source: "empty_state" });
    expect(push).not.toHaveBeenCalled();
  });

  it("focuses an on-page capture box rather than reloading the Inbox", async () => {
    render(
      <>
        <textarea id="capture-raw-text" />
        <FirstActionCta action="capture_inbox_item" label="Capture a note" focusTargetId="capture-raw-text" />
      </>,
    );

    await userEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(document.activeElement?.id).toBe("capture-raw-text"));
    expect(push).not.toHaveBeenCalled();
  });

  it("still navigates when the focus target is absent", async () => {
    render(<FirstActionCta action="capture_inbox_item" label="Capture a note" focusTargetId="not-on-this-page" />);

    await userEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard/inbox"));
  });

  it("navigates even when recording the funnel fails — an empty screen must never trap the user", async () => {
    selectFirstActionAction.mockResolvedValue({ error: "boom" });

    render(<FirstActionCta action="create_task" label="Create a task" />);
    await userEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard/tasks"));
  });
});
