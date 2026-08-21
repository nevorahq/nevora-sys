import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SOURCE_EXT = /\.(?:ts|tsx|mts)$/;

function walk(dir: string): string[] {
  const absolute = join(ROOT, dir);
  if (!existsSync(absolute)) return [];

  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const relative = join(dir, entry.name);
    return entry.isDirectory() ? walk(relative) : SOURCE_EXT.test(entry.name) ? [relative] : [];
  });
}

function read(file: string): string {
  return readFileSync(join(ROOT, file), "utf8");
}

function moduleSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const pattern = /(?:\bfrom\s*|\bimport\s*\(|\brequire\s*\()\s*["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) specifiers.push(match[1]);
  return specifiers;
}

describe("workspace extraction boundaries", () => {
  const packageFiles = [...walk("packages"), ...walk("apps/tasks/src")];
  const portableFiles = [
    ...walk("packages/financial-state"),
    ...walk("packages/tasks-api"),
    ...walk("packages/tasks-contracts"),
  ];

  it("finds independently checked workspace source", () => {
    expect(packageFiles.length).toBeGreaterThanOrEqual(8);
  });

  it.each(walk("apps/tasks/app"))("%s keeps the deployment shell out of the root app", (file) => {
    const imports = moduleSpecifiers(read(file));
    expect(imports.filter((value) => value.startsWith("@/"))).toEqual([]);
    expect(imports.filter((value) => value.startsWith("@supabase/"))).toEqual([]);
  });

  it.each(packageFiles)("%s does not reach into the root application", (file) => {
    const imports = moduleSpecifiers(read(file));
    expect(imports.filter((value) => value.startsWith("@/"))).toEqual([]);
    expect(imports.filter((value) => value === "next" || value.startsWith("next/"))).toEqual([]);
  });

  it.each(portableFiles)("%s keeps portable contracts independent from Supabase", (file) => {
    const imports = moduleSpecifiers(read(file));
    expect(imports.filter((value) => value.startsWith("@supabase/"))).toEqual([]);
  });

  it("keeps the Tasks app boundary on published workspace contracts", () => {
    const imports = walk("apps/tasks/src").flatMap((file) => moduleSpecifiers(read(file)));
    const workspaceImports = imports.filter((value) => value.startsWith("@nevora/"));
    expect(workspaceImports).not.toEqual([]);
    expect(new Set(workspaceImports)).toEqual(
      new Set(["@nevora/tasks-api", "@nevora/tasks-runtime"]),
    );
  });

  it("routes cross-module Tasks server calls through the platform adapter", () => {
    const crossModuleFiles = [
      ...walk("modules").filter((file) => !file.startsWith("modules/tasks/")),
      ...walk("workflows"),
    ];
    const offenders = crossModuleFiles.flatMap((file) =>
      moduleSpecifiers(read(file))
        .filter((specifier) => specifier === "@/modules/tasks/server")
        .map(() => file),
    );

    expect(offenders).toEqual([]);
  });

  it("prevents consumers from returning to pre-workspace compatibility paths", () => {
    const applicationFiles = [
      ...walk("app"),
      ...walk("features"),
      ...walk("lib"),
      ...walk("modules"),
      ...walk("platform"),
      ...walk("shared"),
      ...walk("workflows"),
    ];
    const forbidden = new Set([
      "@/modules/tasks/contracts",
      "@/platform/financial-state/contracts",
      "@/platform/financial-state/ui",
    ]);
    const offenders = applicationFiles.flatMap((file) =>
      moduleSpecifiers(read(file))
        .filter((specifier) => forbidden.has(specifier))
        .map((specifier) => `${file}: ${specifier}`),
    );

    expect(offenders).toEqual([]);
  });
});
