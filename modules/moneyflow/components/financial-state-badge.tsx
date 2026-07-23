import { cn } from "@/shared/utils/cn";
import {
  toCanonicalFinancialState,
  type CanonicalFinancialState,
  type FinancialSurface,
} from "../lib/canonical-financial-state";

/**
 * Canonical financial-state badge (Sprint 4.4 rollout).
 *
 * Renders any per-surface DB status with the ONE canonical vocabulary + colour,
 * via `toCanonicalFinancialState`. Every money surface should use this instead of
 * printing a raw status string, so `task_open` reads as "Due" and `posted` as
 * "Paid" everywhere. Falls back to the raw status (humanised) if a value is
 * somehow unmapped, so it never renders blank.
 */

/**
 * Цвет каждого канонического состояния. Экспортируется, чтобы лендинг
 * (`states-section`) показывал те же цвета, что и приложение, из одного места —
 * обещание «одинаково на каждом экране» держится структурно, а не копипастой.
 */
export const STATE_STYLE: Record<CanonicalFinancialState, string> = {
  detected: "bg-surface-sunken text-text-secondary",
  needs_review: "bg-info-soft text-info",
  planned: "bg-surface-sunken text-text-secondary",
  due: "bg-info-soft text-info",
  paid: "bg-success-soft text-success",
  cancelled: "bg-surface-sunken text-text-muted",
};

export function FinancialStateBadge({
  surface,
  status,
  labels,
  dueDate,
  className,
}: {
  surface: FinancialSurface;
  status: string;
  /** The `dict.money.states` slice — one label per canonical state. */
  labels: Record<CanonicalFinancialState, string>;
  /** Optional obligation date — separates `planned` from `due` (contract §1). */
  dueDate?: string | null;
  className?: string;
}) {
  const canonical = toCanonicalFinancialState(surface, status, { dueDate });
  const label = canonical ? labels[canonical] : status.replace(/_/g, " ");
  const style = canonical ? STATE_STYLE[canonical] : "bg-surface-sunken text-text-secondary";
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", style, className)}>
      {label}
    </span>
  );
}
