import "server-only";

import { getDictionary } from "@/shared/i18n/get-dictionary";
import { getTaskActivity, TASK_ACTIVITY_PAGE_SIZE } from "./get-task-activity";
import { formatTaskActivity, type ActivityFormatStrings } from "../lib/format-task-activity";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

export interface TaskActivityView {
  id: string;
  message: string;
  createdAt: string;
}

export interface TaskActivityViewResult {
  items: TaskActivityView[];
  hasMore: boolean;
  error?: string;
}

/** Собирает строки для форматтера из словаря. */
export function buildActivityStrings(dict: Dictionary): ActivityFormatStrings {
  const a = dict.todos.activity;
  return {
    created:            a.created,
    addedAssignee:      a.addedAssignee,
    removedAssignee:    a.removedAssignee,
    removedSelf:        a.removedSelf,
    changedStatus:      a.changedStatus,
    changedPriority:    a.changedPriority,
    changedTitle:       a.changedTitle,
    changedDescription: a.changedDescription,
    changedDueDate:     a.changedDueDate,
    changedField:       a.changedField,
    deleted:            a.deleted,
    unknownUser:        a.unknownUser,
    statuses:           dict.todos.statuses,
    priorities:         dict.todos.priorities,
  };
}

/**
 * Готовит локализованные элементы активности задачи для UI.
 * Доступ проверяется внутри getTaskActivity (RPC get_task_activity).
 */
export async function getTaskActivityView(
  taskId: string,
  offset = 0,
): Promise<TaskActivityViewResult> {
  const [{ dict }, res] = await Promise.all([
    getDictionary(),
    getTaskActivity(taskId, { limit: TASK_ACTIVITY_PAGE_SIZE, offset }),
  ]);

  if (res.error) return { items: [], hasMore: false, error: res.error };

  const strings = buildActivityStrings(dict);
  return {
    items: res.items.map((it) => ({
      id:        it.id,
      message:   formatTaskActivity(it, strings),
      createdAt: it.createdAt,
    })),
    hasMore: res.hasMore,
  };
}
