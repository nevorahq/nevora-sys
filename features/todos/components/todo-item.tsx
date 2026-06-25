"use client";

import { useState, useTransition } from "react";
import { PencilIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { toggleTodoAction } from "../actions/toggle-todo.action";
import { deleteTodoAction } from "../actions/delete-todo.action";
import { TodoEditForm } from "./todo-edit-form";
import { Modal } from "@/shared/ui/modal";
import { cn } from "@/shared/utils/cn";
import { formatDate } from "@/shared/utils/format-date";
import type { Todo } from "@/entities/todo/model";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { ROUTES } from "@/shared/config/routes";

interface TodoItemProps {
  todo: Todo;
  dict: Dictionary;
}

export function TodoItem({ todo, dict }: TodoItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isToggling, startToggle] = useTransition();
  const [isDeleting, startDelete] = useTransition();

  const isPending = isToggling || isDeleting;

  const priorityStyles = {
    low: "bg-accent-green-soft text-accent-green",
    medium: "bg-accent-yellow-soft text-accent-yellow",
    high: "bg-accent-pink-soft text-accent-pink",
  } as const;

  function handleToggle() {
    startToggle(async () => {
      await toggleTodoAction(todo.id, todo.is_completed);
    });
  }

  function handleDelete() {
    startDelete(async () => {
      await deleteTodoAction(todo.id);
    });
  }

  return (
    <>
      <div
        className={cn(
          "soft-card-sm flex items-center gap-3 p-4 transition-opacity",
          isPending && "opacity-50 pointer-events-none",
        )}
      >
        {/* Checkbox */}
        <button
          type="button"
          role="checkbox"
          aria-checked={todo.is_completed}
          onClick={handleToggle}
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-(--neu-radius-sm)",
            "border transition-all duration-150",
            todo.is_completed
              ? "bg-accent-green border-accent-green shadow-none"
              : "border-border-strong bg-surface-sunken shadow-neu-inset",
          )}
        >
          {todo.is_completed && (
            <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        {/* Content */}
        <Link href={`${ROUTES.tasks}/${todo.id}`} className="min-w-0 flex-1 rounded-(--neu-radius-sm) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
          <p
            className={cn(
              "text-sm font-medium truncate",
              todo.is_completed
                ? "text-text-muted line-through"
                : "text-text-primary",
            )}
          >
            {todo.title}
          </p>
          {todo.description && (
            <p className="mt-0.5 text-xs text-text-muted truncate">
              {todo.description}
            </p>
          )}
        </Link>

        {/* Priority badge */}
        <span className={cn("soft-badge", priorityStyles[todo.priority])}>
          {dict.todos.priorities[todo.priority]}
        </span>

        {/* Due date */}
        {todo.due_date && (
          <span className="hidden sm:inline text-xs text-text-muted">
            {formatDate(todo.due_date)}
          </span>
        )}

        {/* Edit button */}
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="soft-icon-button h-8 w-8 text-text-muted hover:text-text-primary"
          aria-label={dict.todos.form.updateButton}
        >
          <PencilIcon size={15} strokeWidth={1.75} />
        </button>

        {/* Delete button */}
        <button
          type="button"
          onClick={handleDelete}
          className="soft-icon-button h-8 w-8 text-text-muted hover:text-danger"
          aria-label="Delete"
        >
          <Trash2Icon size={15} strokeWidth={1.75} />
        </button>
      </div>

      {/* Edit Modal */}
      <Modal
        isOpen={isEditing}
        onClose={() => setIsEditing(false)}
        title={dict.todos.form.updateButton}
        closeLabel={dict.common.close}
      >
        <TodoEditForm
          todo={todo}
          dict={dict}
          onSuccess={() => setIsEditing(false)}
        />
      </Modal>
    </>
  );
}
