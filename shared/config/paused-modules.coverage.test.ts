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

/**
 * Read-path coverage.
 *
 * The blocks above scan Server Actions, route handlers and pages — every place
 * a paused module is *written to* or *navigated to*. They do not look at what
 * active code *reads*, which is why two leaks survived every one of them:
 * the Action Center generator scanned `crm_deals` on the primary screen, and
 * the AI summary action mapped `deal`/`client` straight onto CRM tables.
 *
 * The invariant below is deliberately about the class, not those two files: any
 * active module that names a paused module's table must also name the gate that
 * keeps it closed. It fails on a file nobody has written yet.
 */
describe("paused modules: read-path coverage", () => {
  /** Real table names, from the migrations — not a hand-kept list. */
  const pausedTables = (() => {
    const names = new Set<string>();
    for (const file of walk("supabase/migrations").filter((f) => f.endsWith(".sql"))) {
      const re = /create table (?:if not exists )?(?:public\.)?((?:crm|booking)_[a-z_]+)/gi;
      for (const m of read(file).matchAll(re)) names.add(m[1].toLowerCase());
    }
    return [...names];
  })();

  it("derives the paused tables from the migrations", () => {
    // A broken derivation would make every assertion below vacuously pass.
    expect(pausedTables).toContain("crm_deals");
    expect(pausedTables).toContain("booking_pages");
    expect(pausedTables.length).toBeGreaterThanOrEqual(12);
  });

  /** Surfaces that *are* the paused modules: they may name their own tables. */
  const PAUSED_SURFACES = [
    "modules/crm/",
    "modules/booking/",
    "features/crm/",
    "app/(dashboard)/dashboard/crm/",
    "app/(dashboard)/dashboard/booking/",
    "app/booking/",
    "app/api/public/booking/",
    "app/api/internal/booking/",
  ];

  /**
   * Pre-existing debt, recorded rather than hidden. Each entry reads a paused
   * module's tables without a gate. None is a new regression, and none is in
   * Phase 1 scope — see `docs/project-workflows-and-beta-plan-2026-07-10.md`.
   *
   * Do not add to this list. Gate the file instead.
   */
  const KNOWN_UNGATED_READS: Record<string, string> = {
    "modules/analytics/queries/get-dashboard-metrics.ts":
      "Analytics still shows CRM client/deal counts while CRM is paused.",
    "modules/analytics/queries/get-module-stats.ts":
      "Analytics still reports CRM deal stats while CRM is paused.",
    "modules/analytics/constants/analytics.constants.ts":
      "Analytics metric catalogue still enumerates CRM tables.",
    "modules/billing/queries/get-usage.ts":
      "Usage counters still count deals/clients toward plan limits.",
    "lib/billing/check-limit.ts":
      "Capability→table map still resolves the `deals`/`clients` capabilities.",
    "modules/action-center/queries/get-action-item-related-entities.ts":
      "Resolves titles for pre-existing `deal`/`client` action items.",
  };

  const activeFiles = walk("modules")
    .concat(walk("features"), walk("lib"), walk("app"), walk("shared"))
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
    .filter((f) => !/\.test\.tsx?$/.test(f))
    .filter((f) => !PAUSED_SURFACES.some((p) => f.replace(/\\/g, "/").startsWith(p)));

  /** Files naming a paused table inside a string literal. */
  const offenders = activeFiles.filter((f) => {
    const src = read(f);
    return pausedTables.some((t) => new RegExp(`["'\`]${t}["'\`]`).test(src));
  });

  it("finds active files at all (guards against a silent empty scan)", () => {
    expect(activeFiles.length).toBeGreaterThanOrEqual(200);
  });

  it.each(offenders)("%s gates its read of a paused module's tables", (file) => {
    if (file in KNOWN_UNGATED_READS) return; // recorded debt, asserted below
    expect(
      read(file),
      `${file} reads a paused module's table without calling isPausedModuleEnabled(). ` +
        `Gate the read, or un-pause the module and delete this test's block.`,
    ).toContain("isPausedModuleEnabled(");
  });

  it("does not silently grow the recorded-debt list", () => {
    const ungated = offenders.filter(
      (f) => !read(f).includes("isPausedModuleEnabled(") && !(f in KNOWN_UNGATED_READS),
    );
    expect(ungated, "new ungated read of a paused module's tables").toEqual([]);
  });

  it("keeps the recorded-debt list honest (no stale entries)", () => {
    // An entry that no longer reads a paused table, or has since been gated,
    // must leave the list — otherwise it masks a future regression in that file.
    for (const file of Object.keys(KNOWN_UNGATED_READS)) {
      expect(existsSync(join(ROOT, file)), `${file}: listed but missing`).toBe(true);
      expect(offenders, `${file}: listed but no longer reads a paused table`).toContain(file);
      expect(
        read(file).includes("isPausedModuleEnabled("),
        `${file}: now gated — remove it from KNOWN_UNGATED_READS`,
      ).toBe(false);
    }
  });
});
