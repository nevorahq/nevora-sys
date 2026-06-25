import type { AutomationHandler } from "../engine/automation-handler.types";

/**
 * task.created — точка интеграции под будущие автоматизации
 * (например: создать напоминание, связать задачу с дедлайном/сделкой).
 *
 * Phase 1 — фундамент: реальной кросс-модульной логики ещё нет, поэтому
 * хендлер осознанно возвращает skipped. Добавление логики:
 * вернуть status:"executed" и побочный эффект (createEntityLink и т.п.).
 */
export const onTaskCreated: AutomationHandler = {
  name: "on-task-created",
  eventName: "task.created",
  async run(ctx) {
    return {
      status: "skipped",
      output: { reason: "no automation rule (Phase 1 foundation)", taskId: ctx.aggregateId },
    };
  },
};
