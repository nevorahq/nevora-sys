import type { TaskActivityItem } from "../queries/get-task-activity";

/**
 * Локализованные строки для рендера активности. Передаются из i18n-словаря,
 * чтобы форматтер оставался чистым и тестируемым.
 */
export interface ActivityFormatStrings {
  created: string;
  addedAssignee: string;
  removedAssignee: string;
  removedSelf: string;
  changedStatus: string;
  changedPriority: string;
  changedTitle: string;
  changedDescription: string;
  changedDueDate: string;
  changedField: string;
  deleted: string;
  unknownUser: string;
  statuses: Record<string, string>;
  priorities: Record<string, string>;
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? "");
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function statusLabel(s: ActivityFormatStrings, value: unknown): string {
  const key = str(value);
  return s.statuses[key] ?? key;
}

function priorityLabel(s: ActivityFormatStrings, value: unknown): string {
  const key = str(value);
  return s.priorities[key] ?? key;
}

/**
 * Превращает запись audit_log в понятное человекочитаемое сообщение.
 * Возвращает одну строку (для update с несколькими полями — части через « · »).
 */
export function formatTaskActivity(
  item: TaskActivityItem,
  s: ActivityFormatStrings,
  currentUserId?: string,
): string {
  const actor = item.actor.name ?? s.unknownUser;
  const target = item.target?.name ?? s.unknownUser;

  switch (item.action) {
    case "create":
      return fill(s.created, { actor });

    case "delete":
      return fill(s.deleted, { actor });

    case "assign":
      return fill(s.addedAssignee, { actor, target });

    case "unassign": {
      const isSelf = item.target?.id != null && item.target.id === item.actor.id;
      // "removed themselves" когда снял сам себя; иначе — кого именно.
      const selfByCurrent = isSelf && (currentUserId === undefined || currentUserId === item.actor.id);
      return selfByCurrent
        ? fill(s.removedSelf, { actor })
        : fill(s.removedAssignee, { actor, target });
    }

    case "status_change":
      return fill(s.changedStatus, {
        actor,
        from: statusLabel(s, item.oldData?.status),
        to:   statusLabel(s, item.newData?.status),
      });

    case "update": {
      const changed = item.newData ?? {};
      const parts: string[] = [];

      if ("status" in changed) {
        parts.push(fill(s.changedStatus, {
          actor,
          from: statusLabel(s, item.oldData?.status),
          to:   statusLabel(s, changed.status),
        }));
      }
      if ("priority" in changed) {
        parts.push(fill(s.changedPriority, {
          actor,
          from: priorityLabel(s, item.oldData?.priority),
          to:   priorityLabel(s, changed.priority),
        }));
      }
      if ("title" in changed)       parts.push(fill(s.changedTitle, { actor }));
      if ("description" in changed) parts.push(fill(s.changedDescription, { actor }));
      if ("due_date" in changed)    parts.push(fill(s.changedDueDate, { actor }));

      if (parts.length === 0) return fill(s.changedField, { actor });
      return parts.join(" · ");
    }

    default:
      return fill(s.changedField, { actor });
  }
}
