"use client";

import { useActionState, useRef } from "react";
import { updateTodoAction } from "../actions/update-todo.action";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { Button } from "@/shared/ui/button";
import { TODO_PRIORITIES } from "@/entities/todo/constants";
import type { Todo } from "@/entities/todo/model";
import type { ActionResult } from "@/lib/validators/common";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

interface TodoEditFormProps {
  todo: Todo;
  dict: Dictionary;
  onSuccess?: () => void;
}

export function TodoEditForm({ todo, dict, onSuccess }: TodoEditFormProps) {
  const t = dict.todos.form;
  const formRef = useRef<HTMLFormElement>(null);

  const [state, formAction, isPending] = useActionState<ActionResult, FormData>(
    async (prevState, formData) => {
      const result = await updateTodoAction(prevState, formData);
      if (!result.error && !result.fieldErrors) {
        onSuccess?.();
      }
      return result;
    },
    {},
  );

  const priorityOptions = TODO_PRIORITIES.map((p) => ({
    value: p,
    label: dict.todos.priorities[p],
  }));

  return (
    <form ref={formRef} action={formAction}>
      {/* Скрытый id задачи */}
      <input type="hidden" name="todoId" value={todo.id} />

      {state.error && (
        <div className="mb-3 rounded-(--neu-radius-md) bg-danger-soft border border-danger/20 px-4 py-3 text-sm text-danger" role="alert">
          {state.error}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <Input
          id="edit-title"
          name="title"
          label={t.titleLabel}
          placeholder={t.titlePlaceholder}
          defaultValue={todo.title}
          required
          error={state.fieldErrors?.title?.[0]}
        />

        <Input
          id="edit-description"
          name="description"
          label={t.descriptionLabel}
          placeholder={t.descriptionPlaceholder}
          defaultValue={todo.description}
          error={state.fieldErrors?.description?.[0]}
        />

        <div className="grid grid-cols-2 gap-3">
          <Select
            id="edit-priority"
            name="priority"
            label={t.priorityLabel}
            options={priorityOptions}
            defaultValue={todo.priority}
            error={state.fieldErrors?.priority?.[0]}
          />

          <Input
            id="edit-due-date"
            name="due_date"
            type="date"
            label={t.dueDateLabel}
            defaultValue={todo.due_date ?? ""}
            error={state.fieldErrors?.due_date?.[0]}
          />
        </div>
      </div>

      <div className="mt-4">
        <Button type="submit" isLoading={isPending} className="w-full">
          {isPending ? dict.common.loading : t.updateButton}
        </Button>
      </div>
    </form>
  );
}
