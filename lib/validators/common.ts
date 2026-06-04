/**
 * Стандартный формат ответа Server Action.
 *
 * Зачем: каждый Server Action возвращает одинаковую структуру.
 * Клиентский код всегда знает: есть error? → показать ошибку.
 * Нет error? → успех.
 *
 * Без стандарта:
 *   loginAction возвращает { success: true }
 *   registerAction возвращает { ok: true, message: "..." }
 *   createTodoAction возвращает { error: null }
 *   → хаос, каждый компонент обрабатывает по-своему
 *
 * Со стандартом:
 *   Все actions возвращают ActionResult
 *   → один useActionState обрабатывает все одинаково
 */
export type ActionResult = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};
