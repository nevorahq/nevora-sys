import { SubItem } from "./sub-item";
import type { Subscription } from "../types/subtracker.types";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

interface SubListProps {
  subscriptions: Subscription[];
  dict: Dictionary;
}

export function SubList({ subscriptions, dict }: SubListProps) {
  return (
    <div className="flex flex-col gap-2.5">
      {subscriptions.map((sub) => (
        <SubItem key={sub.id} subscription={sub} dict={dict} />
      ))}
    </div>
  );
}
