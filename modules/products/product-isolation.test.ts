import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const canonicalPages = [
  "app/(products)/tasks/page.tsx",
  "app/(products)/finance/page.tsx",
  "app/(products)/subscriptions/page.tsx",
] as const;

describe("canonical product surfaces", () => {
  it("exposes all three product roots", () => {
    for (const page of canonicalPages) expect(existsSync(join(ROOT, page))).toBe(true);
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

  it("opens product detail pages in isolated mode", () => {
    for (const page of [
      "app/(products)/tasks/[taskId]/page.tsx",
      "app/(products)/finance/[transactionId]/page.tsx",
      "app/(products)/subscriptions/[subscriptionId]/page.tsx",
    ]) {
      expect(read(page)).toContain("productIsolated");
    }
  });

  it("filters relation UI to entities owned by the current product", () => {
    expect(read("app/(dashboard)/dashboard/tasks/[taskId]/page.tsx"))
      .toContain('["task", "document"]');
    expect(read("app/(dashboard)/dashboard/money/[transactionId]/page.tsx"))
      .toContain('["transaction", "document"]');
    expect(read("app/(dashboard)/dashboard/subscriptions/[subscriptionId]/page.tsx"))
      .toContain('["subscription", "document"]');
  });
});
