"use client";

import { useMemo, useState } from "react";
import { TodoItem } from "./todo-item";
import { TodoFilters } from "./todo-filters";
import { TodoEmptyState } from "./todo-empty-state";
import { useAppSelector } from "@/store/hooks";
import { Select } from "@/shared/ui/select";
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

  // Project filter is local UI state — "" means all projects.
  const [projectFilter, setProjectFilter] = useState("");

  // Distinct projects present in the current task set, for the filter dropdown.
  const projectOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const t of todos) {
      if (t.project) seen.set(t.project.id, t.project.name);
    }
    return [
      { value: "", label: "All projects" },
      ...Array.from(seen, ([value, label]) => ({ value, label })),
      { value: "__none__", label: "No project" },
    ];
  }, [todos]);

  // status — единственный источник истины. done = завершена, остальное = активна.
  const counts = useMemo(
    () => ({
      all: todos.length,
      active: todos.filter((t) => t.status !== "done").length,
      completed: todos.filter((t) => t.status === "done").length,
    }),
    [todos],
  );

  const filteredTodos = useMemo(() => {
    let result = todos;

    if (filter === "active") {
      result = result.filter((t) => t.status !== "done");
    } else if (filter === "completed") {
      result = result.filter((t) => t.status === "done");
    }

    if (projectFilter === "__none__") {
      result = result.filter((t) => !t.project_id);
    } else if (projectFilter) {
      result = result.filter((t) => t.project_id === projectFilter);
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
  }, [todos, filter, searchQuery, projectFilter]);

  return (
    <div className="flex flex-col gap-4">
      {/* TodoFilters больше не получает callbacks — сам работает с Redux */}
      <TodoFilters dict={dict} counts={counts} />

      {/* Project filter — shown only when at least one project is in use */}
      {projectOptions.length > 2 && (
        <div className="sm:max-w-xs">
          <Select
            id="project-filter"
            options={projectOptions}
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="h-10 py-0"
          />
        </div>
      )}

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
