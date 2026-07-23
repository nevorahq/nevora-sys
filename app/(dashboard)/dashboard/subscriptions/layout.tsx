import type { ReactNode } from "react";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { MoneyWorkspaceTabs } from "@/modules/moneyflow/components/money-workspace-tabs";

/**
 * Subscriptions is a tab OF the Money workspace (Sprint 4 — S4.1), not a
 * standalone product — the sidebar reports Finances as the active section here.
 *
 * Without this layout the workspace chrome only existed under `/dashboard/money/*`,
 * so opening a subscription showed Finances highlighted in the sidebar and no
 * Finances context on the page. Mounting the tabs here makes the section the
 * user is in visible on every subscription route, detail pages included.
 */
export default async function SubscriptionsLayout({ children }: { children: ReactNode }) {
  const { dict } = await getDictionary();
  return (
    <div>
      <MoneyWorkspaceTabs labels={dict.money.tabs} />
      <div className="mt-6">{children}</div>
    </div>
  );
}
