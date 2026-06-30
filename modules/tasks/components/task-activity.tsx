"use client";

import { useState, useTransition } from "react";
import { loadTaskActivityAction } from "../actions/load-task-activity.action";
import type { TaskActivityView } from "../queries/get-task-activity-view";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

interface TaskActivityProps {
  taskId: string;
  initialItems: TaskActivityView[];
  initialHasMore: boolean;
  createdAt: string;
  updatedAt: string;
  error?: string;
  dict: Dictionary;
}

function formatLocal(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function TaskActivity({
  taskId,
  initialItems,
  initialHasMore,
  createdAt,
  updatedAt,
  error,
  dict,
}: TaskActivityProps) {
  const t = dict.todos.activity;
  const [items, setItems] = useState<TaskActivityView[]>(initialItems);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleShowMore() {
    setLoadError(null);
    startTransition(async () => {
      const res = await loadTaskActivityAction(taskId, items.length);
      if (res.error) {
        setLoadError(t.loadError);
        return;
      }
      // Защита от дублей при гонке.
      const seen = new Set(items.map((i) => i.id));
      setItems([...items, ...res.items.filter((i) => !seen.has(i.id))]);
      setHasMore(res.hasMore);
    });
  }

  return (
    <section className="soft-card p-5 sm:p-6">
      <h2 className="text-base font-semibold text-text-primary">{t.title}</h2>

      {/* Created at / Last updated */}
      <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <div>
          <dt className="font-medium uppercase tracking-wide text-text-muted">{t.createdAt}</dt>
          <dd className="mt-1 text-text-primary">{formatLocal(createdAt)}</dd>
        </div>
        <div>
          <dt className="font-medium uppercase tracking-wide text-text-muted">{t.lastUpdated}</dt>
          <dd className="mt-1 text-text-primary">{formatLocal(updatedAt)}</dd>
        </div>
      </dl>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-danger">{t.loadError}</p>
      ) : items.length === 0 ? (
        <p className="mt-4 text-sm text-text-muted">{t.empty}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-0.5 border-l-2 border-border pl-3">
              <span className="text-sm text-text-primary">{item.message}</span>
              <time dateTime={item.createdAt} className="text-xs text-text-muted">
                {formatLocal(item.createdAt)}
              </time>
            </li>
          ))}
        </ul>
      )}

      {loadError && (
        <p role="alert" className="mt-3 text-xs text-danger">{loadError}</p>
      )}

      {hasMore && !error && (
        <button
          type="button"
          onClick={handleShowMore}
          disabled={isPending}
          className="mt-4 text-xs font-medium text-text-secondary underline underline-offset-2 hover:text-text-primary disabled:opacity-50"
        >
          {isPending ? t.loading : t.showMore}
        </button>
      )}
    </section>
  );
}
