import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Surface reduction + product independence regression net.
 *
 * The target primary navigation holds at most SEVEN sections. This is a
 * source-level assertion (not a rendered-DOM test) on purpose: the failure
 * mode we guard against is *an eighth item creeping back into `navItems`*,
 * visible in the source without a React runtime.
 *
 * Tasks, Money and Subscriptions are independent primary sections with no
 * shared surfaces between them.
 */

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const sidebar = read("shared/ui/sidebar.tsx");

/** The `const navItems: NavItem[] = [ … ];` array literal, source text only. */
const navItemsBlock = (() => {
  const start = sidebar.indexOf("const navItems");
  const end = sidebar.indexOf("];", start);
  expect(start, "navItems array not found in sidebar.tsx").toBeGreaterThan(-1);
  return sidebar.slice(start, end);
})();

describe("primary navigation: at most seven sections", () => {
  const itemCount = [...navItemsBlock.matchAll(/\{\s*href:\s*ROUTES\./g)].length;

  it("finds the nav items at all (guards against a silent empty scan)", () => {
    expect(itemCount).toBeGreaterThanOrEqual(4);
  });

  it("renders no more than seven top-level sections", () => {
    expect(itemCount).toBeLessThanOrEqual(7);
  });
});

describe("Subscriptions is a standalone nav item", () => {
  it("has its own top-level nav entry", () => {
    expect(navItemsBlock).toMatch(/href:\s*ROUTES\.subscriptions,\s*label:\s*dict\.nav\.subscriptions\b/);
  });

  it("still resolves as a deep link (page not deleted)", () => {
    expect(existsSync(join(ROOT, "app/(dashboard)/dashboard/subscriptions/page.tsx"))).toBe(true);
  });

  it("no longer mounts the Money workspace tabs (it isn't a Money tab anymore)", () => {
    expect(existsSync(join(ROOT, "app/(dashboard)/dashboard/subscriptions/layout.tsx"))).toBe(false);
  });
});

describe("Tasks and Money have no shared nav surface", () => {
  it("dashboard/tasks/financial no longer exists as a route", () => {
    expect(existsSync(join(ROOT, "app/(dashboard)/dashboard/tasks/financial"))).toBe(false);
  });

  it("dashboard/money no longer mounts a tab bar", () => {
    expect(existsSync(join(ROOT, "app/(dashboard)/dashboard/money/layout.tsx"))).toBe(false);
  });
});

// Product independence: Home (Action Center) and Inbox were cross-product
// aggregators, so they were dropped from the primary nav — each product
// (Tasks/Money/Subscriptions) no longer surfaces the others' activity.
describe("Home and Inbox are not primary nav sections", () => {
  it("does not list Home (Action Center)", () => {
    expect(navItemsBlock).not.toMatch(/href:\s*ROUTES\.dashboard\b/);
  });

  it("does not list Inbox", () => {
    expect(navItemsBlock).not.toMatch(/href:\s*ROUTES\.inbox\b/);
  });

  it("drops Overview as a standalone nav item", () => {
    expect(navItemsBlock).not.toMatch(/href:\s*ROUTES\.overview\b/);
  });
});
