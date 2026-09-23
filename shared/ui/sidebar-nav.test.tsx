// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { en } from "@/shared/i18n/dictionaries/en";
import { parseProductContext } from "@/modules/products/product-context";

let pathname = "/tasks";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

import { Sidebar } from "./sidebar";

afterEach(() => {
  cleanup();
  document.cookie = "nevora_product_context=; Path=/; Max-Age=0";
  document.cookie = "nevora_product_context=; Path=/settings; Max-Age=0";
  document.cookie = "nevora_product_context=; Path=/dashboard/documents; Max-Age=0";
  window.history.replaceState({}, "", "/");
});

function visibleLinks() {
  return screen.getAllByRole("link").map((link) => link.getAttribute("href"));
}

describe("product-scoped sidebar", () => {
  it("Tasks показывает Tasks, Projects и общие Settings", () => {
    pathname = "/tasks";
    render(<Sidebar dict={en} product="tasks" />);
    expect(visibleLinks()).toEqual(["/tasks", "/tasks/projects", "/settings"]);
  });

  it("Finance не показывает Tasks и Subscriptions", () => {
    pathname = "/finance";
    render(<Sidebar dict={en} product="finance" />);
    expect(visibleLinks()).toEqual(["/finance", "/settings"]);
    expect(screen.queryByText(en.nav.tasks)).toBeNull();
    expect(screen.queryByText(en.nav.subscriptions)).toBeNull();
  });

  it("Subscriptions постоянно показывает Documents и Settings, но не другие продукты", () => {
    pathname = "/subscriptions";
    render(<Sidebar dict={en} product="subscriptions" />);
    expect(visibleLinks()).toEqual(["/subscriptions", "/dashboard/documents", "/settings"]);
    expect(screen.queryByText(en.nav.tasks)).toBeNull();
    expect(screen.queryByText(en.nav.money)).toBeNull();
  });

  it("переход из Subscriptions в Settings сохраняет product-контекст", async () => {
    pathname = "/subscriptions";
    render(<Sidebar dict={en} product="subscriptions" />);

    await userEvent.click(screen.getByRole("link", { name: en.nav.settings }));
    window.history.replaceState({}, "", "/settings/profile");

    expect(document.cookie).toContain("nevora_product_context=subscriptions");
  });

  it("переход из Subscriptions в Documents сохраняет product-контекст", async () => {
    pathname = "/subscriptions";
    render(<Sidebar dict={en} product="subscriptions" />);

    await userEvent.click(screen.getByRole("link", { name: en.nav.documents }));
    window.history.replaceState({}, "", "/dashboard/documents");

    expect(document.cookie).toContain("nevora_product_context=subscriptions");
  });

  it("Settings восстанавливает тот же набор навигации для Subscriptions", () => {
    pathname = "/settings/profile";
    const product = parseProductContext("subscriptions");
    render(<Sidebar dict={en} product={product} />);

    expect(visibleLinks()).toEqual(["/subscriptions", "/dashboard/documents", "/settings"]);
  });

  it("Documents восстанавливает тот же набор навигации для Subscriptions", () => {
    pathname = "/dashboard/documents";
    const product = parseProductContext("subscriptions");
    render(<Sidebar dict={en} product={product} />);

    expect(visibleLinks()).toEqual(["/subscriptions", "/dashboard/documents", "/settings"]);
  });

  it("платформенная оболочка содержит только общие Documents и Settings", () => {
    pathname = "/settings";
    render(<Sidebar dict={en} />);
    expect(visibleLinks()).toEqual(["/dashboard/documents", "/settings"]);
  });
});
