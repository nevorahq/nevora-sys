/**
 * Константы домена Todo.
 *
 * Единый источник правды для бизнес-правил.
 * Используются в: Zod-схемах, UI-компонентах, фильтрах.
 */

export const TODO_PRIORITIES = ["low", "medium", "high"] as const;
export type TodoPriority = (typeof TODO_PRIORITIES)[number];

export const TODO_FILTERS = ["all", "active", "completed"] as const;
export type TodoFilter = (typeof TODO_FILTERS)[number];

export const TODO_TITLE_MAX_LENGTH = 200;
export const TODO_DESCRIPTION_MAX_LENGTH = 1000;
