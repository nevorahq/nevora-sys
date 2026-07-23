import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { ONBOARDING_ROUTES } from "@/shared/config/routes";

/**
 * `ONBOARDING_ROUTES` used to state a rule that nothing enforced: "пользователь
 * с org не может зайти на эти пути". `/onboarding` stayed open to an existing
 * member, and creating a second organization there produces a trial-less,
 * read-only org (migration 086) with no checkout to escape it in private beta.
 *
 * These tests make the constant load-bearing: every page it lists must call the
 * guard, so adding a second onboarding route without one fails here rather than
 * shipping another silent hole.
 */

const ROOT = process.cwd();
const APP = join(ROOT, "app");
const read = (abs: string) => readFileSync(abs, "utf8");

/**
 * Source with comments removed. A guard named in a comment is not a guard —
 * scanning the raw text would happily pass a page that only *mentions* it.
 */
const readCode = (abs: string) =>
  read(abs)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

/** Every `page.tsx` under app/, keyed by the URL it serves (route groups stripped). */
function collectPageRoutes(dir: string, out: Map<string, string>): Map<string, string> {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) {
      collectPageRoutes(abs, out);
      continue;
    }
    if (entry !== "page.tsx") continue;
    const segments = relative(APP, dir)
      .split(sep)
      .filter((s) => s.length > 0 && !(s.startsWith("(") && s.endsWith(")")));
    out.set(`/${segments.join("/")}`, abs);
  }
  return out;
}

const pageRoutes = collectPageRoutes(APP, new Map());

describe("onboarding routes are closed to users who already have an organization", () => {
  it("finds the routes at all (guards against a vacuous scan)", () => {
    expect(ONBOARDING_ROUTES.length).toBeGreaterThan(0);
    expect(pageRoutes.size).toBeGreaterThan(10);
  });

  it.each(ONBOARDING_ROUTES)("%s renders a page that calls the guard", (route) => {
    const page = pageRoutes.get(route);
    expect(page, `no page.tsx serves ${route}`).toBeDefined();
    const code = readCode(page as string);
    expect(code, `${route} must import the guard`).toMatch(
      /import\s*\{[^}]*requireNoOrganization[^}]*\}\s*from/,
    );
    expect(code, `${route} must actually call the guard`).toMatch(/requireNoOrganization\s*\(/);
  });

  it("the guard redirects to the dashboard rather than rendering the form", () => {
    const guard = readCode(join(ROOT, "lib/auth/require-no-organization.ts"));
    expect(guard).toContain("redirect(ROUTES.dashboard)");
    expect(guard).toMatch(/\.eq\("status", "active"\)/);
  });

  it("the create action repeats the check — it is a POST endpoint of its own", () => {
    const action = readCode(join(ROOT, "features/onboarding/actions/create-organization.action.ts"));
    const guardAt = action.indexOf("hasActiveOrganization(");
    const rpcAt = action.indexOf('rpc("create_organization"');
    expect(guardAt).toBeGreaterThan(-1);
    // The refusal must come BEFORE the organization is created, not after.
    expect(guardAt).toBeLessThan(rpcAt);
  });

  it("fails OPEN on a lookup error, so a genuinely org-less user is never locked out", () => {
    // requireOrg bounces an org-less user here; if this guard bounced back on a
    // transient read failure the two would ping-pong and onboarding would be
    // unreachable. The error path must not redirect.
    const guard = readCode(join(ROOT, "lib/auth/require-no-organization.ts"));
    const errorBlock = guard.slice(guard.indexOf("if (error)"), guard.indexOf("if (data &&"));
    expect(errorBlock).not.toContain("redirect(");
  });
});
