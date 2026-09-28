// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorCopyProvider } from "@/shared/ui/error-copy";
import { ro } from "@/shared/i18n/dictionaries/ro";
import DashboardError from "./error";

afterEach(cleanup);

describe("dashboard error screen", () => {
  it("renders in the viewer's language from the shell's copy", () => {
    render(
      <ErrorCopyProvider copy={ro.errorBoundary}>
        <DashboardError error={Object.assign(new Error("boom"), { digest: "abc123" })} reset={vi.fn()} />
      </ErrorCopyProvider>,
    );

    expect(screen.getByText("Ceva nu a mers bine")).toBeDefined();
    expect(screen.getByText("Referință:", { exact: false })).toBeDefined();
    expect(screen.getByRole("button", { name: "Încearcă din nou" })).toBeDefined();
  });
});
