"use client";

import { cn } from "@/shared/utils/cn";
import { TODO_FILTERS } from "@/entities/todo/constants";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import { setFilter, setSearchQuery } from "@/store/slices/todo-ui.slice";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

/**
 * Фильтры задач: All / Active / Completed + поиск.
 *
 * ЧТО ИЗМЕНИЛОСЬ (Phase 6 — Redux):
 *
 * БЫЛО (Phase 5):
 *   Props: activeFilter, searchQuery, onFilterChange, onSearchChange
 *   Всё управлялось родителем (TodoList) через callback props.
 *
 * СТАЛО (Phase 6):
 *   useAppSelector — читает filter и searchQuery из Redux store.
 *   useAppDispatch — отправляет actions в Redux store.
 *   Нет callback props — компонент самостоятельный.
 *
 * Преимущество:
 *   Если нужен второй набор фильтров (например в Sidebar),
 *   он просто импортирует те же хуки — и автоматически синхронизирован.
 *   Без Redux нужно было бы пробрасывать state через 3+ уровня props.
 */
interface TodoFiltersProps {
  dict: Dictionary;
  counts: { all: number; active: number; completed: number };
}

export function TodoFilters({ dict, counts }: TodoFiltersProps) {
  const dispatch = useAppDispatch();
  const activeFilter = useAppSelector((state) => state.todoUi.filter);
  const searchQuery = useAppSelector((state) => state.todoUi.searchQuery);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {/* Filter buttons */}
      <div className="flex gap-1.5">
        {TODO_FILTERS.map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => dispatch(setFilter(filter))}
            className={cn(
              "rounded-(--neu-radius-pill) px-4 py-1.5 text-sm font-medium transition-all duration-150",
              activeFilter === filter
                ? "bg-text-primary text-text-inverse shadow-neu-control"
                : "text-text-secondary hover:bg-surface hover:shadow-neu-sm",
            )}
          >
            {dict.todos.filters[filter]}
            <span className="ml-1.5 text-xs opacity-60">{counts[filter]}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        type="search"
        value={searchQuery}
        onChange={(e) => dispatch(setSearchQuery(e.target.value))}
        placeholder={dict.todos.search.placeholder}
        className="soft-control px-4 py-2 text-sm w-full sm:w-64"
      />
    </div>
  );
}
