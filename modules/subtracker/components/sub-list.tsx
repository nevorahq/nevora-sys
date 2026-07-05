import { SubItem, type SubPaymentIndicator } from "./sub-item";
import type { Subscription } from "../types/subtracker.types";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

interface SubListProps {
  subscriptions: Subscription[];
  dict: Dictionary;
  /** Open payment cycle per subscription id (for the workflow status badge). */
  cycleBySub?: Record<string, SubPaymentIndicator>;
}

export function SubList({ subscriptions, dict, cycleBySub }: SubListProps) {
  return (
    <div className="flex flex-col gap-2.5">
      {subscriptions.map((sub) => (
        <SubItem key={sub.id} subscription={sub} dict={dict} cycle={cycleBySub?.[sub.id]} />
      ))}
    </div>
  );
}
