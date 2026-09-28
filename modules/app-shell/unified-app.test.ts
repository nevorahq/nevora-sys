import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("one app shell for every module", () => {
  it("keeps the short module URLs", () => {
    for (const page of [
      "app/(products)/tasks/page.tsx",
      "app/(products)/finance/page.tsx",
      "app/(products)/subscriptions/page.tsx",
    ]) {
      expect(existsSync(join(ROOT, page))).toBe(true);
    }
  });

  it("keeps legacy dashboard links on permanent redirects", () => {
    const config = read("next.config.ts");
    expect(config).toContain('source: "/dashboard/tasks/:path*"');
    expect(config).toContain('destination: "/tasks/:path*"');
    expect(config).toContain('source: "/dashboard/money/:path*"');
    expect(config).toContain('destination: "/finance/:path*"');
    expect(config).toContain('source: "/dashboard/subscriptions/:path*"');
    expect(config).toContain('destination: "/subscriptions/:path*"');
  });

  it("renders dashboard, module and settings routes in the same AppShell", () => {
    for (const layout of [
      "app/(dashboard)/layout.tsx",
      "app/(products)/layout.tsx",
      "app/(platform)/settings/layout.tsx",
    ]) {
      expect(read(layout)).toContain("<AppShell>");
    }
    for (const product of ["tasks", "finance", "subscriptions"]) {
      expect(existsSync(join(ROOT, `app/(products)/${product}/layout.tsx`))).toBe(false);
    }
  });

  it("shows cross-module relations on detail pages again", () => {
    for (const page of [
      "app/(dashboard)/dashboard/tasks/[taskId]/page.tsx",
      "app/(dashboard)/dashboard/money/[transactionId]/page.tsx",
      "app/(dashboard)/dashboard/subscriptions/[subscriptionId]/page.tsx",
      "app/(products)/tasks/[taskId]/page.tsx",
      "app/(products)/finance/[transactionId]/page.tsx",
      "app/(products)/subscriptions/[subscriptionId]/page.tsx",
    ]) {
      expect(read(page)).not.toContain("productIsolated");
    }
  });
});
