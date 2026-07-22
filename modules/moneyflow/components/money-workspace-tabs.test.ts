import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Sprint 4 — S4.1: Money workspace shell.
 *
 * Money is the hub for the financial surfaces. Source-level assertions: the tabs
 * link all three surfaces, the layout mounts them across /money/*, and — critically —
 * the folded surfaces keep their own routes (no deep link moved).
 */

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("money workspace tabs", () => {
  const tabs = read("modules/moneyflow/components/money-workspace-tabs.tsx");

  it("links the three financial surfaces", () => {
    expect(tabs).toContain("ROUTES.money");
    expect(tabs).toContain("ROUTES.tasksFinancial");
    expect(tabs).toContain("ROUTES.subscriptions");
  });

  it("is mounted above every /money/* route via the layout", () => {
    const layout = read("app/(dashboard)/dashboard/money/layout.tsx");
    expect(layout).toContain("MoneyWorkspaceTabs");
    expect(layout).toMatch(/labels=\{dict\.money\.tabs\}/);
  });

  it("does not move any deep link — the three routes still resolve", () => {
    expect(existsSync(join(ROOT, "app/(dashboard)/dashboard/money/page.tsx"))).toBe(true);
    expect(existsSync(join(ROOT, "app/(dashboard)/dashboard/tasks/financial/page.tsx"))).toBe(true);
    expect(existsSync(join(ROOT, "app/(dashboard)/dashboard/subscriptions/page.tsx"))).toBe(true);
  });

  it.each(["en", "ru", "ro"])("%s dictionary defines money.tabs labels", (locale) => {
    const dict = read(`shared/i18n/dictionaries/${locale}.ts`);
    const moneyBlock = dict.slice(dict.indexOf("money: {"));
    expect(moneyBlock).toMatch(/tabs:\s*\{[\s\S]*transactions:[\s\S]*financialTasks:[\s\S]*subscriptions:/);
  });
});
