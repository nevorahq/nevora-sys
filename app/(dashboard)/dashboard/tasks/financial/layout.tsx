import type { ReactNode } from "react";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { MoneyWorkspaceTabs } from "@/modules/moneyflow/components/money-workspace-tabs";

/**
 * Financial Tasks is the second tab OF the Money workspace (Sprint 4 — S4.1).
 * It keeps its `/dashboard/tasks/financial` route (no deep link moved), but it
 * belongs to Finances, so it carries the same workspace chrome as the other two
 * tabs instead of dropping the user into a bare page.
 */
export default async function FinancialTasksLayout({ children }: { children: ReactNode }) {
  const { dict } = await getDictionary();
  return (
    <div>
      <MoneyWorkspaceTabs labels={dict.money.tabs} />
      <div className="mt-6">{children}</div>
    </div>
  );
}
