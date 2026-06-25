/**
 * MoneyFlow domain constants.
 *
 * Единый источник правды для бизнес-правил MoneyFlow.
 * Используются в: Zod-схемах, UI-компонентах, SQL CHECK constraints.
 *
 * Почему `as const`:
 * TypeScript выводит литеральный тип ("cash" | "card" | ...)
 * вместо общего string. Это даёт автокомплит и compile-time проверку.
 */

// ── Account Types ──
export const ACCOUNT_TYPES = ["cash", "card", "bank", "savings", "other"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

// ── Transaction Types ──
export const TRANSACTION_TYPES = ["income", "expense"] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

// Статус транзакции: posted = фактическая (в балансе),
// planned = запланированная (прогноз «Предстоящие расходы», вне баланса).
export const TRANSACTION_STATUSES = ["posted", "planned"] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

// ── Category Types (совпадают с transaction types) ──
export const CATEGORY_TYPES = TRANSACTION_TYPES;
export type CategoryType = TransactionType;

// ── Currency ──
// MVP: одна валюта. При масштабировании — массив + user preference.
export const DEFAULT_CURRENCY = "MDL" as const;

// ── Validation Limits ──
export const ACCOUNT_NAME_MAX = 100;
export const CATEGORY_NAME_MAX = 50;
export const TRANSACTION_TITLE_MAX = 200;
export const TRANSACTION_NOTE_MAX = 500;

/**
 * Почему amount хранится как positive + type, а не как signed number:
 *
 * Вариант A (signed): amount = -250 (expense), amount = +1000 (income)
 *   Минусы:
 *   - UI должен разбираться: отрицательный = расход
 *   - SUM(amount) даёт баланс, но нужен отдельный SUM для расходов
 *   - Пользователь вводит "-250" — ошибки UX
 *
 * Вариант B (positive + type) ← наш выбор:
 *   type = "expense", amount = 250
 *   type = "income", amount = 1000
 *   Плюсы:
 *   - amount всегда > 0 — простая валидация (CHECK amount > 0)
 *   - Баланс: SUM(CASE WHEN type='income' THEN amount ELSE -amount END)
 *   - UI: пользователь вводит "250", выбирает тип — интуитивно
 *   - Фильтрация: WHERE type = 'expense' — просто
 */
