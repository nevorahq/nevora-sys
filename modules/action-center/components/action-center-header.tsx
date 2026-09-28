"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCwIcon } from "lucide-react";
import { refreshActionCenter } from "../actions/refresh-action-center.action";

/** Заголовок Action Center + кнопка пересборки сигналов. */
export function ActionCenterHeader({ title, refreshLabel }: { title: string; refreshLabel: string }) {
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
        <h1 className="text-2xl font-semibold text-text-primary">{title}</h1>
      </div>
      <button
        type="button"
        onClick={refresh}
        aria-label={refreshLabel}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-(--neu-radius-pill) bg-surface-sunken px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary disabled:opacity-50"
      >
        <RefreshCwIcon size={15} className={pending ? "animate-spin" : undefined} />
        <span className="hidden sm:inline">{refreshLabel}</span>
      </button>
    </div>
  );
}
