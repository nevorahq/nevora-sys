// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AvatarUploader } from "./AvatarUploader";
import { removeAvatar } from "../actions/remove-avatar";
import { en } from "@/shared/i18n/dictionaries/en";

vi.mock("../actions/update-avatar", () => ({ updateAvatar: vi.fn() }));
vi.mock("../actions/remove-avatar", () => ({ removeAvatar: vi.fn() }));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

afterEach(cleanup);

describe("AvatarUploader", () => {
  it("confirms avatar removal in an in-app dialog instead of window.confirm", async () => {
    const nativeConfirm = vi.spyOn(window, "confirm");
    vi.mocked(removeAvatar).mockResolvedValue({ success: "Avatar removed." });
    render(
      <AvatarUploader
        avatarUrl="https://example.com/a.png"
        initials="AB"
        t={en.settings.profile.avatar}
        common={en.common}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    const dialog = screen.getByRole("dialog");
    expect(screen.getByRole("heading", { name: "Remove avatar?" })).toBeTruthy();
    expect(removeAvatar).not.toHaveBeenCalled();

    fireEvent.click(dialog.querySelector("button.bg-danger") as HTMLButtonElement);
    await waitFor(() => expect(dialog.hasAttribute("open")).toBe(false));
    expect(removeAvatar).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Avatar removed.")).toBeTruthy();
    expect(nativeConfirm).not.toHaveBeenCalled();
  });
});
