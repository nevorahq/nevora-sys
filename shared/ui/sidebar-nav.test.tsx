// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { en } from "@/shared/i18n/dictionaries/en";

let pathname = "/tasks";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

import { Sidebar } from "./sidebar";

afterEach(cleanup);

const ALL_MODULES = [
  "/dashboard",
  "/dashboard/inbox",
  "/tasks",
  "/tasks/projects",
  "/finance",
  "/subscriptions",
  "/dashboard/documents",
  "/settings",
];

function visibleLinks() {
  return screen.getAllByRole("link").map((link) => link.getAttribute("href"));
}

function activeLink() {
  return screen
    .getAllByRole("link")
    .find((link) => link.className.includes("shadow-neu-inset"))
    ?.getAttribute("href");
}

describe("one app sidebar", () => {
  it.each(["/dashboard", "/tasks", "/finance", "/subscriptions", "/settings/profile"])(
    "shows every module, Home first, on %s",
    (path) => {
      pathname = path;
      render(<Sidebar dict={en} />);
      expect(visibleLinks()).toEqual(ALL_MODULES);
    },
  );

  it.each([
    ["/dashboard", "/dashboard"],
    ["/dashboard/inbox", "/dashboard/inbox"],
    ["/tasks/123", "/tasks"],
    ["/tasks/projects/9", "/tasks/projects"],
    ["/finance/accounts", "/finance"],
    ["/subscriptions/42", "/subscriptions"],
    ["/dashboard/documents/7", "/dashboard/documents"],
    ["/settings/billing", "/settings"],
  ])("highlights the most specific module for %s", (path, expected) => {
    pathname = path;
    render(<Sidebar dict={en} />);
    expect(activeLink()).toBe(expected);
  });

  it("labels Home and Inbox from the dictionary", () => {
    pathname = "/dashboard";
    render(<Sidebar dict={en} />);
    expect(screen.getByRole("link", { name: en.nav.home }).getAttribute("href")).toBe("/dashboard");
    expect(screen.getByRole("link", { name: en.nav.inbox }).getAttribute("href")).toBe("/dashboard/inbox");
  });
});
