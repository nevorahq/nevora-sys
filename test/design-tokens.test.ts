import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regression guard (Phase 5.1 §4.5): `accent-purple` never existed in the
 * Tailwind @theme, so any `bg-accent-purple` / `text-accent-purple` class
 * silently resolves to a transparent color — invisible buttons/links. All
 * usages were replaced with real tokens; this scan keeps them out for good.
 */

const ROOT = join(__dirname, "..");
const SOURCE_DIRS = ["app", "modules", "features", "shared", "entities"];
const SOURCE_EXT = /\.(tsx?|css)$/;
const SKIP_DIRS = new Set(["node_modules", ".next", "graphify-out"]);

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) collectSourceFiles(path, out);
    else if (SOURCE_EXT.test(entry)) out.push(path);
  }
  return out;
}

describe("design tokens", () => {
  it("has no accent-purple usages (token does not exist in the theme)", () => {
    const offenders: string[] = [];
    for (const dir of SOURCE_DIRS) {
      for (const file of collectSourceFiles(join(ROOT, dir))) {
        if (readFileSync(file, "utf8").includes("accent-purple")) {
          offenders.push(file.slice(ROOT.length + 1));
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
