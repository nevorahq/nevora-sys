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
    expect(navItemsBlock).toMatch(/href:\s*ROUTES\.money[\s\S]*activeMatch:\s*\[ROUTES\.subscriptions\]/);
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
