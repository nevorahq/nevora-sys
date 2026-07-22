"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ROUTES } from "@/shared/config/routes";
import { cn } from "@/shared/utils/cn";

interface TabLabels {
  transactions: string;
  financialTasks: string;
  subscriptions: string;
}

/**
 * Money workspace tabs (Sprint 4 — S4.1).
 *
 * Makes Money the hub for the financial surfaces. The three surfaces keep their
 * own routes (Financial Tasks under `/tasks/financial`, Subscriptions under
 * `/subscriptions`) — this only adds cross-navigation, so no deep link moves.
 * Money Intelligence stays embedded in the Transactions view, not a separate tab.
 */
export function MoneyWorkspaceTabs({ labels }: { labels: TabLabels }) {
  const pathname = usePathname();

  const tabs = [
    { href: ROUTES.money, label: labels.transactions, active: pathname.startsWith(ROUTES.money) },
    { href: ROUTES.tasksFinancial, label: labels.financialTasks, active: pathname.startsWith(ROUTES.tasksFinancial) },
    { href: ROUTES.subscriptions, label: labels.subscriptions, active: pathname.startsWith(ROUTES.subscriptions) },
  ];

  return (
    <nav aria-label="Money workspace" className="border-b border-border-soft">
      <ul className="flex gap-1 overflow-x-auto pb-px">
        {tabs.map((tab) => (
          <li key={tab.href} className="shrink-0">
            <Link
              href={tab.href}
              aria-current={tab.active ? "page" : undefined}
              className={cn(
                "inline-flex items-center border-b-2 px-4 py-2.5 text-sm font-medium transition-colors -mb-px",
                tab.active
                  ? "border-text-primary text-text-primary"
                  : "border-transparent text-text-secondary hover:text-text-primary hover:border-border-strong",
              )}
            >
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
