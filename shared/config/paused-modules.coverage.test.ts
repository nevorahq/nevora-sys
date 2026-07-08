import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Route-gating regression net for the PAUSED modules (CRM, Booking).
 *
 * These are source-level assertions rather than HTTP tests, and that is
 * deliberate: the failure mode we are guarding against is *a new file being
 * added without a guard*, not an existing guard regressing. An HTTP test only
 * covers the routes someone remembered to enumerate; scanning the tree covers
 * the ones they didn't.
 *
 * If you legitimately add a CRM/Booking surface, add its guard — do not relax
 * these tests. If you un-pause a module, delete its block here in the same PR.
 */

const ROOT = process.cwd();

/** Recursively collect files under `dir` (returns [] when dir is absent). */
function walk(dir: string): string[] {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(rel));
    else out.push(rel);
  }
  return out;
}

const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("paused modules: Server Action coverage", () => {
  const serverActionFiles = [...walk("modules/crm"), ...walk("modules/booking"), ...walk("features/crm")]
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
    .filter((f) => !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"))
    .filter((f) => read(f).includes('"use server"'));

  it("finds the paused modules' Server Actions (guards against a silent empty scan)", () => {
    // If this drops to 0 the scan is broken and every assertion below vacuously passes.
    expect(serverActionFiles.length).toBeGreaterThanOrEqual(19);
  });

  it.each(serverActionFiles)("%s gates its Server Action", (file) => {
    const src = read(file);
    const expected = file.startsWith("modules/booking") ? "booking" : "crm";
    expect(src).toContain(`assertPausedModuleAction("${expected}")`);
  });

  it("calls the guard before resolving the org / reading the payload", () => {
    for (const file of serverActionFiles) {
      const src = read(file);
      const guard = src.indexOf("assertPausedModuleAction(");
      const auth = src.indexOf("await requireOrg()");
      if (auth === -1) continue;
      expect(guard, `${file}: guard must precede requireOrg()`).toBeLessThan(auth);
    }
  });
});

describe("paused modules: Route Handler coverage", () => {
  const bookingRoutes = walk("app/api")
    .filter((f) => f.endsWith("route.ts") && f.includes("booking"));

  it("finds the booking route handlers", () => {
    expect(bookingRoutes.length).toBeGreaterThanOrEqual(7);
  });

  it.each(bookingRoutes)("%s returns 404 while Booking is paused", (file) => {
    expect(read(file)).toContain('pausedModuleGuard("booking")');
  });
});

describe("paused modules: page + layout coverage", () => {
  it("blocks the CRM dashboard page", () => {
    expect(read("app/(dashboard)/dashboard/crm/page.tsx")).toContain('assertPausedModuleEnabled("crm")');
  });

  it("blocks every /dashboard/booking/* route at the layout", () => {
    expect(read("app/(dashboard)/dashboard/booking/layout.tsx")).toContain('assertPausedModuleEnabled("booking")');
  });

  it("blocks the PUBLIC /booking/* surface at the layout", () => {
    // An org that published a booking page before the pause must not keep
    // serving it to anonymous visitors.
    expect(read("app/booking/layout.tsx")).toContain('assertPausedModuleEnabled("booking")');
  });

  it("leaves no unguarded page under a paused dashboard route", () => {
    const pages = [...walk("app/(dashboard)/dashboard/crm"), ...walk("app/(dashboard)/dashboard/booking")]
      .filter((f) => f.endsWith("page.tsx") || f.endsWith("layout.tsx"));
    expect(pages.length).toBeGreaterThanOrEqual(6);

    for (const file of pages) {
      const covered =
        read(file).includes("assertPausedModuleEnabled") ||
        // Child pages inherit the section layout's guard.
        (file.includes("/booking/") && existsSync(join(ROOT, "app/(dashboard)/dashboard/booking/layout.tsx")));
      expect(covered, `${file} is not covered by a paused-module guard`).toBe(true);
    }
  });
});

describe("paused modules: public product surface", () => {
  it("does not appear in the sidebar navigation", () => {
    const sidebar = read("shared/ui/sidebar.tsx");
    const navBlock = sidebar.slice(sidebar.indexOf("const navItems"), sidebar.indexOf("function isActive"));
    expect(navBlock).not.toMatch(/^\s*\{\s*href:\s*ROUTES\.crm\b/m);
    expect(navBlock).not.toMatch(/^\s*\{\s*href:\s*ROUTES\.booking\b/m);
  });

  it("does not appear in a public sitemap", () => {
    // No sitemap.ts exists today. If one is ever added it must not list paused routes.
    const sitemaps = walk("app").filter((f) => /sitemap\.(ts|tsx|xml)$/.test(f));
    for (const file of sitemaps) {
      const src = read(file);
      expect(src).not.toMatch(/\/dashboard\/crm|\/dashboard\/booking|["'`]\/booking\//);
    }
  });

  it("does not appear in landing or pricing copy", () => {
    const copy = read("modules/landing/constants/landing-content.ts");
    // Word-boundary matches: "Contact" (an anchor) and "contacts@" must not trip this.
    expect(copy).not.toMatch(/\bCRM\b/);
    expect(copy).not.toMatch(/\bdeals?\s+pipeline\b/i);
    expect(copy).not.toMatch(/\bbooking\b/i);
  });

  it("makes no autonomous-AI or automatic-posting claim in landing copy", () => {
    const copy = read("modules/landing/constants/landing-content.ts");
    expect(copy).not.toMatch(/autonomous/i);
    expect(copy).not.toMatch(/automatically (posts?|creates?|pays?|records?)/i);
    expect(copy).not.toMatch(/\bauto-post/i);
  });
});
