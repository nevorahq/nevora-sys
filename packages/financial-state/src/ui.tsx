import {
  toCanonicalFinancialState,
  type CanonicalFinancialState,
  type FinancialSurface,
} from "./contracts";

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
  labels: Record<CanonicalFinancialState, string>;
  dueDate?: string | null;
  className?: string;
}) {
  const canonical = toCanonicalFinancialState(surface, status, { dueDate });
  const label = canonical ? labels[canonical] : status.replace(/_/g, " ");
  const style = canonical ? STATE_STYLE[canonical] : "bg-surface-sunken text-text-secondary";

  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        style,
        className,
      ].filter(Boolean).join(" ")}
    >
      {label}
    </span>
  );
}
