import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Sprint 2 — Settings "Advanced" grouping regression net.
 *
 * Power-user surfaces (Developer Access / API) live under an "Advanced" heading,
 * separated from everyday settings and gated by role + plan entitlement. This is
 * a source-level assertion because the failure mode is structural: a new
 * advanced surface being dropped into the main group, or Developer losing its
 * admin gate.
 */

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const src = read("modules/settings/components/SettingsSidebar.tsx");

/** The `const ITEMS = [ … ] as const;` array literal, source text only. */
const itemsBlock = (() => {
  const start = src.indexOf("const ITEMS");
  const end = src.indexOf("] as const;", start);
  expect(start, "ITEMS array not found").toBeGreaterThan(-1);
  return src.slice(start, end);
})();

describe("settings sidebar: Advanced grouping", () => {
  it("puts Developer in the advanced group", () => {
    expect(itemsBlock).toMatch(/settingsDeveloper[\s\S]*?group:\s*"advanced"/);
  });

  it("keeps Developer admin-gated (role permission)", () => {
    expect(itemsBlock).toMatch(/settingsDeveloper[\s\S]*?admin:\s*true/);
  });

  it("renders an Advanced section heading", () => {
    expect(src).toContain("labels.advanced");
    expect(src).toMatch(/advancedItems\.length\s*>\s*0/);
  });

  it("does not list Automation (system process, no user route)", () => {
    expect(itemsBlock).not.toMatch(/automation/i);
  });
});

describe("settings sidebar: labels mirror the dictionaries", () => {
  it("declares the advanced label in the interface", () => {
    expect(src).toMatch(/interface SidebarLabels[\s\S]*?advanced:\s*string/);
  });

  it.each(["en", "ru", "ro"])("%s dictionary has settings.nav.advanced", (locale) => {
    const dict = read(`shared/i18n/dictionaries/${locale}.ts`);
    // settings.nav block carries an `advanced:` label used by the heading.
    expect(dict).toMatch(/advanced:\s*"[^"]+"/);
  });
});
