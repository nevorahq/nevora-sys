import { z } from "zod";

/**
 * Стандартный формат ответа Server Action.
 *
 * Зачем: каждый Server Action возвращает одинаковую структуру.
 * Клиентский код всегда знает: есть error? → показать ошибку.
 * Нет error? → успех.
 */
export type ActionResult = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  documentId?: string;
  taskId?: string;
  subscriptionId?: string;
  warning?: string;
  /**
   * Регистрация прошла, но проект требует подтверждения email — сессии ещё нет.
   * Форма показывает экран «проверьте почту» вместо редиректа на dashboard.
   */
  emailConfirmationRequired?: boolean;
};

/**
 * Валидатор UUID.
 *
 * Все ID в нашей системе — UUID. Валидируем на входе в каждый action,
 * чтобы мусор не доходил до БД. Defense in depth:
 * Zod (форма) → UUID (ID) → RLS (БД) = три барьера.
 */
export const uuidSchema = z.string().uuid("Invalid ID format");
