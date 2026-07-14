"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCwIcon } from "lucide-react";
import { refreshActionCenter } from "../actions/refresh-action-center.action";

/** Заголовок Action Center + кнопка пересборки сигналов. */
export function ActionCenterHeader() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function refresh() {
    startTransition(async () => {
      await refreshActionCenter();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Action Center</h1>
        <p className="mt-1 text-sm text-text-muted">A read-only view of what needs attention — open each item in its module to act.</p>
      </div>
      <button
        type="button"
        onClick={refresh}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-(--neu-radius-pill) bg-surface-sunken px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary disabled:opacity-50"
      >
        <RefreshCwIcon size={15} className={pending ? "animate-spin" : undefined} />
        <span className="hidden sm:inline">Refresh</span>
      </button>
    </div>
  );
}
