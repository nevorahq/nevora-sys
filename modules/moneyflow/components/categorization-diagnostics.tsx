import { ActivityIcon } from "lucide-react";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import type { CategorizationDiagnostics } from "../queries/get-categorization-diagnostics";

interface CategorizationDiagnosticsCardProps {
  data: CategorizationDiagnostics;
  labels: Dictionary["money"]["intelligence"]["diagnostics"];
}

/**
 * Admin-only pipeline health card (Phase 5.1 §4.6). Raw status keys are shown
 * on purpose — this is an ops view, not a localized product surface.
 */
export function CategorizationDiagnosticsCard({ data, labels }: CategorizationDiagnosticsCardProps) {
  return (
    <section className="mt-4">
      <div className="soft-card-sm p-4">
        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-muted">
          <ActivityIcon size={13} /> {labels.title}
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-text-secondary">{labels.transactions}</p>
            <ul className="mt-1.5 space-y-1">
              {Object.entries(data.transactions).map(([status, count]) => (
                <li key={status} className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-mono text-xs text-text-muted">{status}</span>
                  <span className="font-medium text-text-primary">{count}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-medium text-text-secondary">{labels.suggestions}</p>
            <ul className="mt-1.5 space-y-1">
              {Object.entries(data.suggestions).map(([status, count]) => (
                <li key={status} className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-mono text-xs text-text-muted">{status}</span>
                  <span className="font-medium text-text-primary">{count}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
