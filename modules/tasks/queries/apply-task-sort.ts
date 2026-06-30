import "server-only";

import type { TaskSort } from "../constants/task-sort.constants";

/** Name of the sortable view created in migration 061. */
export const TASK_LIST_VIEW = "task_smart_list";

/**
 * Minimal shape of a PostgREST query builder for ordering. We only ever call
 * `.order()` with hard-coded column names below — sort input is never
 * interpolated into SQL, which keeps the whitelist on the server.
 */
interface Orderable {
  order(
    column: string,
    options?: { ascending?: boolean; nullsFirst?: boolean },
  ): Orderable;
}

const ASC_NULLS_LAST = { ascending: true, nullsFirst: false } as const;
const DESC = { ascending: false } as const;

/**
 * Apply a whitelisted task sort to a query over `task_smart_list`.
 *
 * Each mode is a fixed chain of `.order()` calls on known columns:
 *   - sort_overdue   : 0 = active & overdue (top), 1 = everything else
 *   - is_closed      : 0 = active (above), 1 = closed (below)
 *   - priority_weight: high=1 .. none=4
 *   - due_date       : earliest first, NULLs last
 *   - created_at     : newest first as the final tie-breaker
 *
 * smart_default = overdue-active first, then active by priority, closed last —
 * within each group by due date then recency.
 */
export function applyTaskSort<Q extends Orderable>(query: Q, sort: TaskSort): Q {
  switch (sort) {
    case "due_date_asc":
      return query.order("due_date", ASC_NULLS_LAST).order("created_at", DESC) as Q;

    case "due_date_desc":
      return query
        .order("due_date", { ascending: false, nullsFirst: false })
        .order("created_at", DESC) as Q;

    case "priority_desc":
      return query
        .order("priority_weight", { ascending: true })
        .order("due_date", ASC_NULLS_LAST)
        .order("created_at", DESC) as Q;

    case "created_at_desc":
      return query.order("created_at", DESC) as Q;

    case "created_at_asc":
      return query.order("created_at", { ascending: true }) as Q;

    case "smart_default":
    default:
      return query
        .order("sort_overdue", { ascending: true })
        .order("is_closed", { ascending: true })
        .order("priority_weight", { ascending: true })
        .order("due_date", ASC_NULLS_LAST)
        .order("created_at", DESC) as Q;
  }
}
