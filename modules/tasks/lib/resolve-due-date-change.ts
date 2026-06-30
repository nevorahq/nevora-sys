import type { TaskDueDateChangeType } from "../constants/task.constants";

/**
 * Классифицирует изменение срока задачи по старой и новой дате.
 *
 * Чистая функция: вход — две даты в формате "YYYY-MM-DD" (new обязателен,
 * old может отсутствовать), выход — тип изменения для task_due_date_changes.
 *
 *   old = null              → "set"        (срок впервые установлен)
 *   new > old               → "extended"   (продление)
 *   new < old               → "shortened"  (сокращение)
 *   new === old             → null         (нет изменения — caller должен отклонить)
 *
 * Сравнение лексикографическое: для строк формата "YYYY-MM-DD" оно совпадает
 * с календарным порядком, поэтому Date-парсинг не нужен и нет проблем с TZ.
 */
export function resolveDueDateChange(
  oldDueDate: string | null,
  newDueDate: string,
): TaskDueDateChangeType | null {
  if (!oldDueDate) return "set";
  if (newDueDate > oldDueDate) return "extended";
  if (newDueDate < oldDueDate) return "shortened";
  return null;
}
