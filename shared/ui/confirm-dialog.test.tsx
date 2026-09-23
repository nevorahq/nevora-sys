// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./confirm-dialog";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

afterEach(cleanup);

function renderDialog(props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  render(
    <ConfirmDialog
      isOpen
      onCancel={onCancel}
      onConfirm={onConfirm}
      title="Deactivate account?"
      description="Card will be hidden."
      confirmLabel="Deactivate"
      pendingLabel="Deactivating…"
      cancelLabel="Cancel"
      closeLabel="Close"
      {...props}
    />,
  );
  return { onCancel, onConfirm };
}

describe("ConfirmDialog", () => {
  it("confirms and cancels through its own buttons", () => {
    const { onCancel, onConfirm } = renderDialog();

    expect(screen.getByRole("heading", { name: "Deactivate account?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("locks both actions and ignores dismissal while pending", () => {
    const { onCancel } = renderDialog({ isPending: true, error: "Could not deactivate." });

    const confirm = screen.getByRole("button", { name: "Deactivating…" }) as HTMLButtonElement;
    const cancel = screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(cancel.disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toBe("Could not deactivate.");

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onCancel).not.toHaveBeenCalled();
  });
});
