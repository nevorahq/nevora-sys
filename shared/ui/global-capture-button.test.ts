import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Sprint 2 — global capture entry point (S2.3) regression net.
 *
 * One "+ Add" button lives in the dashboard top bar and must route to the Inbox
 * capture surface, so a user can start capturing from any section. Source-level
 * assertions: the failure mode is the button being dropped from the layout, or
 * repointed away from the capture surface.
 */

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("global capture button", () => {
  const button = read("shared/ui/global-capture-button.tsx");

  it("routes to the Inbox capture surface", () => {
    expect(button).toMatch(/href=\{ROUTES\.inbox\}/);
  });

  it("is mounted in the dashboard top bar", () => {
    const layout = read("app/(dashboard)/layout.tsx");
    expect(layout).toContain("GlobalCaptureButton");
    expect(layout).toMatch(/<GlobalCaptureButton\s+label=\{dict\.nav\.add\}/);
  });

  it.each(["en", "ru", "ro"])("%s dictionary has nav.add", (locale) => {
    const dict = read(`shared/i18n/dictionaries/${locale}.ts`);
    const navBlock = dict.slice(dict.indexOf("nav: {"), dict.indexOf("nav: {") + 800);
    expect(navBlock).toMatch(/\badd:\s*"[^"]+"/);
  });
});
