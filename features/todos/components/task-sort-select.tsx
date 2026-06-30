"use client";

import { useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ArrowUpDownIcon } from "lucide-react";
import { Select } from "@/shared/ui/select";
import {
  TASK_SORT_OPTIONS,
  TASK_SORT_LABELS,
  DEFAULT_TASK_SORT,
  type TaskSort,
} from "@/modules/tasks/constants/task-sort.constants";

/**
 * Sort selector bound to the `?sort=` URL param.
 *
 * URL is the single source of truth: changing the value pushes a new param and
 * the Server Component re-queries with the validated sort. Other params
 * (filters, project) are preserved. Selecting the default removes the param to
 * keep URLs clean.
 */
export function TaskSortSelect({ current }: { current: TaskSort }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === DEFAULT_TASK_SORT) {
      params.delete("sort");
    } else {
      params.set("sort", value);
    }
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  return (
    <div className="flex items-center gap-2">
      <ArrowUpDownIcon size={15} className="shrink-0 text-text-muted" aria-hidden />
      <Select
        id="task-sort"
        aria-label="Sort tasks"
        value={current}
        onChange={(e) => handleChange(e.target.value)}
        disabled={isPending}
        options={TASK_SORT_OPTIONS.map((s) => ({ value: s, label: TASK_SORT_LABELS[s] }))}
        className="h-10 py-0"
      />
    </div>
  );
}
