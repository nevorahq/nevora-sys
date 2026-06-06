import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { TodoFilter } from "@/entities/todo/constants";

/**
 * Todo UI Slice — клиентское состояние интерфейса задач.
 *
 * Что здесь хранится и ПОЧЕМУ:
 *
 * filter — какой фильтр активен (all / active / completed).
 *   Почему в Redux: может понадобиться в Header (счётчик),
 *   Sidebar (быстрые фильтры), TodoList — несвязанные компоненты.
 *
 * searchQuery — текст в поле поиска.
 *   Почему в Redux: может использоваться для подсветки совпадений
 *   в TodoItem, который не является child поисковой строки.
 *
 * selectedTodoId — ID выбранной задачи (для будущего редактирования).
 *   Почему в Redux: клик на TodoItem → открыть детали в боковой панели.
 *   TodoItem и панель деталей — не parent-child.
 *
 * Что здесь НЕ хранится:
 * - Сами todos (server state → PostgreSQL → Server Component)
 * - Данные пользователя (server state → Supabase Auth)
 * - Состояние загрузки формы (useActionState → локальный state формы)
 */

interface TodoUiState {
  filter: TodoFilter;
  searchQuery: string;
  selectedTodoId: string | null;
}

const initialState: TodoUiState = {
  filter: "all",
  searchQuery: "",
  selectedTodoId: null,
};

/**
 * createSlice — главная функция Redux Toolkit.
 *
 * Что она делает:
 * 1. Принимает name, initialState, reducers
 * 2. Генерирует action creators (setFilter, setSearchQuery...)
 * 3. Генерирует action types ("todoUi/setFilter", "todoUi/setSearchQuery"...)
 * 4. Оборачивает reducers в Immer (можно "мутировать" state)
 *
 * Без createSlice нужно писать:
 * - action types вручную: const SET_FILTER = "todoUi/SET_FILTER"
 * - action creators вручную: const setFilter = (f) => ({ type: SET_FILTER, payload: f })
 * - reducer с switch/case: switch(action.type) { case SET_FILTER: return {...state, filter: action.payload} }
 *
 * createSlice делает всё это за тебя из одного объекта.
 */
const todoUiSlice = createSlice({
  name: "todoUi",

  initialState,

  reducers: {
    /**
     * setFilter — изменить активный фильтр.
     *
     * PayloadAction<TodoFilter> — TypeScript знает:
     *   dispatch(setFilter("completed")) ← OK
     *   dispatch(setFilter("invalid"))   ← TypeScript ERROR
     *
     * state.filter = action.payload — выглядит как мутация,
     * но Immer создаёт новый объект. Это безопасно.
     */
    setFilter(state, action: PayloadAction<TodoFilter>) {
      state.filter = action.payload;
    },

    /**
     * setSearchQuery — обновить текст поиска.
     */
    setSearchQuery(state, action: PayloadAction<string>) {
      state.searchQuery = action.payload;
    },

    /**
     * setSelectedTodoId — выбрать задачу (или снять выбор: null).
     */
    setSelectedTodoId(state, action: PayloadAction<string | null>) {
      state.selectedTodoId = action.payload;
    },

    /**
     * resetFilters — сбросить фильтры к начальным.
     * Не принимает payload — просто возвращает к defaults.
     */
    resetFilters(state) {
      state.filter = initialState.filter;
      state.searchQuery = initialState.searchQuery;
    },
  },
});

/**
 * Экспорт action creators.
 *
 * todoUiSlice.actions содержит функции, сгенерированные из reducers:
 *   setFilter("completed") → { type: "todoUi/setFilter", payload: "completed" }
 *
 * Деструктуризация — удобно импортировать по имени:
 *   import { setFilter } from "@/store/slices/todo-ui.slice"
 */
export const { setFilter, setSearchQuery, setSelectedTodoId, resetFilters } =
  todoUiSlice.actions;

/**
 * Экспорт reducer.
 *
 * Reducer передаётся в configureStore (store.ts).
 * Это функция, которая обрабатывает все actions этого slice.
 */
export const todoUiReducer = todoUiSlice.reducer;
