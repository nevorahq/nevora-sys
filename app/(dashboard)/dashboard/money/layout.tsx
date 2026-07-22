import type { ReactNode } from "react";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { MoneyWorkspaceTabs } from "@/modules/moneyflow/components/money-workspace-tabs";

/**
 * Money workspace layout (Sprint 4 — S4.1). Renders the workspace tabs above
 * every `/dashboard/money/*` surface, turning Money into the hub for the
 * financial surfaces (Transactions, Financial Tasks, Subscriptions).
 */
export default async function MoneyLayout({ children }: { children: ReactNode }) {
  const { dict } = await getDictionary();
  return (
    <div>
      <MoneyWorkspaceTabs labels={dict.money.tabs} />
      <div className="mt-6">{children}</div>
    </div>
  );
}
