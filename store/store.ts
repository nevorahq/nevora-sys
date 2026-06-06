import { configureStore } from "@reduxjs/toolkit";
import { todoUiReducer } from "./slices/todo-ui.slice";

/**
 * Redux Store — единый контейнер клиентского UI state.
 *
 * configureStore из Redux Toolkit:
 * - Автоматически подключает Redux DevTools (инспекция в браузере)
 * - Автоматически добавляет middleware (thunk для async actions)
 * - Включает проверки: нельзя мутировать state, нельзя хранить
 *   несериализуемые значения (Date, Map, Set, функции)
 *
 * reducer — объект, где ключ = имя slice, значение = reducer.
 * Каждый slice отвечает за свою часть state.
 *
 * Результат: store.getState() вернёт:
 * {
 *   todoUi: { filter: "all", searchQuery: "", selectedTodoId: null }
 * }
 */
export const store = configureStore({
  reducer: {
    todoUi: todoUiReducer,
  },
});

/**
 * Типы для TypeScript.
 *
 * RootState — тип ВСЕГО state дерева.
 *   Выводится автоматически из store.getState().
 *   Если добавить новый slice — тип обновится сам.
 *
 * AppDispatch — тип функции dispatch.
 *   Нужен для типизированных хуков (useAppDispatch).
 */
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
