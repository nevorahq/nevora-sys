"use client";

import { useMemo, useState, useTransition } from "react";
import { XIcon, UserPlusIcon } from "lucide-react";
import { assignTaskAction, unassignTaskAction } from "../actions/assign-task.action";
import { cn } from "@/shared/utils/cn";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

export interface TaskAssigneeView {
  userId: string;
  name: string | null;
  isCreator: boolean;
}

export interface TaskMemberOption {
  id: string;
  name: string | null;
}

interface TaskAssigneesManagerProps {
  taskId: string;
  assignees: TaskAssigneeView[];
  members: TaskMemberOption[];
  canManage: boolean;
  currentUserId: string;
  dict: Dictionary;
}

export function TaskAssigneesManager({
  taskId,
  assignees,
  members,
  canManage,
  currentUserId,
  dict,
}: TaskAssigneesManagerProps) {
  const t = dict.todos.assignees;
  const fallbackName = dict.todos.activity.unknownUser;

  const [list, setList] = useState<TaskAssigneeView[]>(assignees);
  const [error, setError] = useState<string | null>(null);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Активные участники, ещё не назначенные на задачу.
  const available = useMemo(() => {
    const assigned = new Set(list.map((a) => a.userId));
    return members.filter((m) => !assigned.has(m.id));
  }, [members, list]);

  const isLast = list.length <= 1;

  function nameOf(name: string | null): string {
    return name?.trim() || fallbackName;
  }

  function handleAdd(event: React.ChangeEvent<HTMLSelectElement>) {
    const userId = event.target.value;
    if (!userId) return;
    event.target.value = ""; // сброс выбора

    const member = members.find((m) => m.id === userId);
    const previous = list;
    setError(null);
    setPendingUserId(userId);
    // Оптимистично добавляем.
    setList([...list, { userId, name: member?.name ?? null, isCreator: false }]);

    startTransition(async () => {
      const result = await assignTaskAction(taskId, userId);
      if (result?.error) {
        setList(previous); // восстановление прежнего состояния
        setError(result.error || t.addFailed);
      }
      setPendingUserId(null);
    });
  }

  function handleRemove(userId: string) {
    if (isLast) return;
    const previous = list;
    setError(null);
    setPendingUserId(userId);
    setList(list.filter((a) => a.userId !== userId)); // оптимистично

    startTransition(async () => {
      const result = await unassignTaskAction(taskId, userId);
      if (result?.error) {
        setList(previous); // восстановление прежнего состояния
        setError(result.error || t.removeFailed);
      }
      setPendingUserId(null);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2" aria-label={t.title}>
        {list.map((a) => {
          const canRemove =
            !isLast && (canManage || a.userId === currentUserId);
          const removing = isPending && pendingUserId === a.userId;
          return (
            <li
              key={a.userId}
              className={cn(
                "flex items-center justify-between gap-2 rounded-(--neu-radius-md) bg-surface-sunken px-3 py-2",
                removing && "opacity-50",
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm text-text-primary">{nameOf(a.name)}</span>
                {a.isCreator && (
                  <span className="shrink-0 rounded-full bg-accent-lilac-soft px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent-lilac">
                    {t.creatorBadge}
                  </span>
                )}
              </span>

              {canRemove && (
                <button
                  type="button"
                  onClick={() => handleRemove(a.userId)}
                  disabled={isPending}
                  aria-label={
                    a.userId === currentUserId
                      ? t.removeSelf
                      : t.removeLabel.replace("{name}", nameOf(a.name))
                  }
                  className="soft-icon-button h-7 w-7 shrink-0 text-text-muted hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-50"
                >
                  <XIcon size={14} strokeWidth={2} />
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {isLast && canManage && (
        <p className="text-xs text-text-muted">{t.lastAssigneeHint}</p>
      )}

      {canManage && (
        <div className="flex items-center gap-2">
          <UserPlusIcon size={15} className="shrink-0 text-text-muted" />
          <select
            aria-label={t.addLabel}
            disabled={isPending || available.length === 0}
            defaultValue=""
            onChange={handleAdd}
            className="soft-control flex-1 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-50"
          >
            <option value="" disabled>
              {available.length === 0 ? t.noMembers : t.addPlaceholder}
            </option>
            {available.map((m) => (
              <option key={m.id} value={m.id}>
                {nameOf(m.name)}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
