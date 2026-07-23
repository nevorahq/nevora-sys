import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Sprint 2 — surface reduction regression net.
 *
 * The target primary navigation holds at most SIX sections. This is a
 * source-level assertion (not a rendered-DOM test) on purpose: the failure mode
 * we guard against is *a seventh item creeping back into `navItems`* or
 * *Subscriptions being re-promoted to a standalone nav entry*, both of which are
 * visible in the source without a React runtime.
 *
 * Subscriptions folded INTO Money: its route must still resolve (deep links and
 * persisted `target_url`s keep working) and it must stay reachable from the
 * Money page — a folded section that becomes unreachable is a lost feature, not
 * a simplified nav.
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

describe("primary navigation: at most six sections", () => {
  const itemCount = [...navItemsBlock.matchAll(/\{\s*href:\s*ROUTES\./g)].length;

  it("finds the nav items at all (guards against a silent empty scan)", () => {
    expect(itemCount).toBeGreaterThanOrEqual(4);
  });

  it("renders no more than six top-level sections", () => {
    expect(itemCount).toBeLessThanOrEqual(6);
  });
});

describe("Subscriptions folded into Money", () => {
  it("is not a standalone top-level nav item", () => {
    // Subscriptions must not have its own `{ href: ROUTES.subscriptions, … }`
    // entry in navItems anymore.
    expect(navItemsBlock).not.toMatch(/href:\s*ROUTES\.subscriptions\b/);
    expect(navItemsBlock).not.toMatch(/label:\s*dict\.nav\.subscriptions\b/);
  });

  it("keeps Money active when the user is on the Subscriptions route", () => {
    // The Money nav item claims the subscriptions path via activeMatch, so the
    // folded section still highlights its parent section.
    expect(navItemsBlock).toMatch(/href:\s*ROUTES\.money[\s\S]*activeMatch:\s*\[[^\]]*ROUTES\.subscriptions/);
  });

  it("still resolves as a deep link (page not deleted)", () => {
    expect(existsSync(join(ROOT, "app/(dashboard)/dashboard/subscriptions/page.tsx"))).toBe(true);
  });

  it("stays reachable from the Money page", () => {
    const money = read("app/(dashboard)/dashboard/money/page.tsx");
    expect(money).toMatch(/href=\{ROUTES\.subscriptions\}/);
    expect(money).toContain("dict.money.subscriptionsLink");
  });
});

/**
 * A folded section must still tell the user where they are. The sidebar reports
 * Finances on `/dashboard/subscriptions/*`; if the Money workspace chrome is not
 * mounted there, the page shows no Finances context at all and the highlight
 * reads as a bug. Both halves are asserted together on purpose.
 */
describe("a folded section keeps its parent context visible", () => {
  it.each([
    ["app/(dashboard)/dashboard/money/layout.tsx", "Transactions"],
    ["app/(dashboard)/dashboard/subscriptions/layout.tsx", "Subscriptions"],
    ["app/(dashboard)/dashboard/tasks/financial/layout.tsx", "Financial Tasks"],
    // Detail routes inherit their section's layout, so a subscription detail
    // page carries the same chrome as the list.
  ])("%s mounts the Money workspace chrome", (layoutPath) => {
    expect(existsSync(join(ROOT, layoutPath))).toBe(true);
    expect(read(layoutPath)).toContain("MoneyWorkspaceTabs");
  });

  it("never lights two sections at once for Financial Tasks", () => {
    // /dashboard/tasks/financial sits under Work's href but belongs to Finances.
    expect(navItemsBlock).toMatch(/href:\s*ROUTES\.tasks,[\s\S]*excludeMatch:\s*\[ROUTES\.tasksFinancial\]/);
    expect(navItemsBlock).toMatch(/href:\s*ROUTES\.money[\s\S]*ROUTES\.tasksFinancial/);
    // The exclusion has to be evaluated BEFORE the prefix match, or Work wins.
    const isActiveFn = sidebar.slice(sidebar.indexOf("function isActive"));
    const excludeAt = isActiveFn.indexOf("excludeMatch");
    const prefixAt = isActiveFn.indexOf("pathname.startsWith(item.href)");
    expect(excludeAt).toBeGreaterThan(-1);
    expect(excludeAt).toBeLessThan(prefixAt);
  });
});

// Sprint 3 — GAP-C: Home = Action Center.
describe("Home = Action Center", () => {
  it("Home is the first nav item and points at the Action Center (/dashboard)", () => {
    expect(navItemsBlock).toMatch(/href:\s*ROUTES\.dashboard,\s*label:\s*dict\.nav\.home/);
  });

  it("matches /dashboard exactly so Home is not active on every dashboard route", () => {
    // ROUTES.dashboard is a prefix of every dashboard path; the Home item must
    // use exact matching to avoid always reporting active.
    expect(navItemsBlock).toMatch(/href:\s*ROUTES\.dashboard[\s\S]*exact:\s*true/);
    expect(read("shared/ui/sidebar.tsx")).toMatch(/if\s*\(item\.exact\)\s*return\s+pathname\s*===\s*item\.href/);
  });

  it("renders /dashboard (the Action Center) as the Home page", () => {
    expect(read("app/(dashboard)/dashboard/page.tsx")).toContain("ActionCenterPage");
  });

  it("drops Overview as a standalone nav item", () => {
    expect(navItemsBlock).not.toMatch(/href:\s*ROUTES\.overview\b/);
  });

  it("folds /dashboard/overview into Home via a redirect (no 404, deep links kept)", () => {
    const overview = read("app/(dashboard)/dashboard/overview/page.tsx");
    expect(overview).toContain("redirect(ROUTES.dashboard)");
  });

  it("keeps Inbox as the Capture/Review section", () => {
    expect(navItemsBlock).toMatch(/href:\s*ROUTES\.inbox,\s*label:\s*dict\.nav\.inbox/);
  });
});
