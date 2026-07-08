import type { ReactNode } from "react";
import { cn } from "@/shared/utils/cn";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  /**
   * Phase B / B6: what turns a dead end into the next step. An empty state with no
   * action tells the user their screen is broken; one with an action tells them
   * what the product is for.
   *
   * Omit it when the emptiness is a filter result rather than an absence of data —
   * "no tasks match your filters" is not an activation moment.
   */
  actions?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, actions, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "soft-inset flex flex-col items-center justify-center rounded-(--neu-radius-xl) px-4 py-14 text-center",
        className,
      )}
    >
      <div className="soft-icon-button mb-4 h-14 w-14 pointer-events-none">{icon}</div>
      <h3 className="text-sm font-semibold text-text-secondary">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-xs text-text-muted">{description}</p>}
      {actions && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{actions}</div>}
    </div>
  );
}
