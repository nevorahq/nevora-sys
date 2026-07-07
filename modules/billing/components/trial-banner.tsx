import Link from "next/link";
import { AlertTriangleIcon, Clock3Icon } from "lucide-react";
import { ROUTES } from "@/shared/config/routes";
import type { TrialState } from "../queries/get-trial-state";

export function TrialBanner({ trial }: { trial: TrialState }) {
  if (trial.kind === "not_trial") return null;

  if (trial.kind === "denied") {
    return (
      <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
        <div className="flex items-center gap-2"><AlertTriangleIcon size={18} /><span>The free trial was already used for your account. Choose Start, Pro or Business to activate this workspace.</span></div>
        <Link className="shrink-0 font-medium underline" href={ROUTES.billing}>Choose a plan</Link>
      </div>
    );
  }

  if (trial.kind === "expired") {
    return (
      <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
        <div className="flex items-center gap-2"><AlertTriangleIcon size={18} /><span>Your trial has ended. Your data is safe, but the workspace is now read-only. Choose Start, Pro or Business to continue.</span></div>
        <Link className="shrink-0 font-medium underline" href={ROUTES.billing}>View plans</Link>
      </div>
    );
  }

  const urgent = trial.daysRemaining <= 2;
  return (
    <div className={`mb-6 flex items-center justify-between gap-4 rounded-xl border px-4 py-3 text-sm ${urgent ? "border-yellow-300 bg-yellow-50 text-yellow-900 dark:border-yellow-900 dark:bg-yellow-950 dark:text-yellow-100" : "border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100"}`}>
      <div className="flex items-center gap-2"><Clock3Icon size={18} /><span>Free trial active: {trial.daysRemaining} {trial.daysRemaining === 1 ? "day" : "days"} remaining.</span></div>
      <Link className="shrink-0 font-medium underline" href={ROUTES.billing}>Usage & plans</Link>
    </div>
  );
}
