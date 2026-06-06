"use client";

import { useMemo } from "react";
import { TodoItem } from "./todo-item";
import { TodoFilters } from "./todo-filters";
import { TodoEmptyState } from "./todo-empty-state";
import { useAppSelector } from "@/store/hooks";
import type { Todo } from "@/entities/todo/model";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

/**
 * TodoList — оркестратор списка задач.
 *
 * ЧТО ИЗМЕНИЛОСЬ (Phase 6 — Redux):
 *
 * БЫЛО (Phase 5):
 *   const [filter, setFilter] = useState<TodoFilter>("all");
 *   const [searchQuery, setSearchQuery] = useState("");
 *
 * СТАЛО (Phase 6):
 *   const filter = useAppSelector((state) => state.todoUi.filter);
 *   const searchQuery = useAppSelector((state) => state.todoUi.searchQuery);
 *
 * Разница:
 * - useState — state живёт ВНУТРИ TodoList. Другие компоненты не видят его.
 * - useAppSelector — state живёт в Redux store. ЛЮБОЙ компонент может прочитать.
 *
 * TodoFilters больше не получает onFilterChange/onSearchChange через props.
 * Он сам делает dispatch(setFilter(...)) напрямую в Redux.
 * Это устраняет prop drilling.
 */
interface TodoListProps {
  todos: Todo[];
  dict: Dictionary;
}

export function TodoList({ todos, dict }: TodoListProps) {
  // Читаем UI state из Redux store (вместо useState)
  const filter = useAppSelector((state) => state.todoUi.filter);
  const searchQuery = useAppSelector((state) => state.todoUi.searchQuery);

  const counts = useMemo(
    () => ({
      all: todos.length,
      active: todos.filter((t) => !t.is_completed).length,
      completed: todos.filter((t) => t.is_completed).length,
    }),
    [todos],
  );

  const filteredTodos = useMemo(() => {
    let result = todos;

    if (filter === "active") {
      result = result.filter((t) => !t.is_completed);
    } else if (filter === "completed") {
      result = result.filter((t) => t.is_completed);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(query) ||
          t.description.toLowerCase().includes(query),
      );
    }

    return result;
  }, [todos, filter, searchQuery]);

  return (
    <div className="flex flex-col gap-4">
      {/* TodoFilters больше не получает callbacks — сам работает с Redux */}
      <TodoFilters dict={dict} counts={counts} />

      {filteredTodos.length === 0 ? (
        <TodoEmptyState
          title={
            todos.length === 0
              ? dict.todos.empty.title
              : dict.todos.empty.filtered
          }
          description={
            todos.length === 0
              ? dict.todos.empty.description
              : ""
          }
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {filteredTodos.map((todo) => (
            <TodoItem key={todo.id} todo={todo} dict={dict} />
          ))}
        </div>
      )}
    </div>
  );
}
