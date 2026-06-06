"use client";

import { useActionState, useRef } from "react";
import { createTodoAction } from "../actions/create-todo.action";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { Button } from "@/shared/ui/button";
import { TODO_PRIORITIES } from "@/entities/todo/constants";
import type { ActionResult } from "@/lib/validators/common";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

/**
 * Форма создания задачи.
 *
 * Client Component — использует useActionState для связи с Server Action.
 *
 * useRef на <form> нужен для сброса формы после успешного создания:
 * если state пуст (нет ошибок) и форма была отправлена — очищаем поля.
 */
interface TodoFormProps {
  dict: Dictionary;
  onSuccess?: () => void;
}

export function TodoForm({ dict, onSuccess }: TodoFormProps) {
  const t = dict.todos.form;
  const formRef = useRef<HTMLFormElement>(null);

  const [state, formAction, isPending] = useActionState<ActionResult, FormData>(
    async (prevState, formData) => {
      const result = await createTodoAction(prevState, formData);
      if (!result.error && !result.fieldErrors) {
        formRef.current?.reset();
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
      {state.error && (
        <div className="mb-3 rounded-(--neu-radius-md) bg-danger-soft border border-danger/20 px-4 py-3 text-sm text-danger" role="alert">
          {state.error}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Input
            id="title"
            name="title"
            placeholder={t.titlePlaceholder}
            required
            error={state.fieldErrors?.title?.[0]}
          />
        </div>

        <div className="w-full sm:w-36">
          <Select
            id="priority"
            name="priority"
            options={priorityOptions}
            defaultValue="medium"
            error={state.fieldErrors?.priority?.[0]}
          />
        </div>

        <div className="w-full sm:w-40">
          <Input
            id="due_date"
            name="due_date"
            type="date"
            error={state.fieldErrors?.due_date?.[0]}
          />
        </div>

        <Button type="submit" isLoading={isPending} className="w-full sm:w-auto">
          {isPending ? dict.common.loading : t.createButton}
        </Button>
      </div>
    </form>
  );
}
