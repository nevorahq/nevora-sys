"use client";

import { useActionState, useState } from "react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import type { ActionResult } from "@/lib/validators/common";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { acceptPlannerSuggestionAction } from "../actions/accept-planner-suggestion.action";
import { rejectPlannerSuggestionAction } from "../actions/reject-planner-suggestion.action";
import { editPlannerSuggestionAction } from "../actions/edit-planner-suggestion.action";
import type { PlannerSuggestion } from "../types/planner.types";

interface SuggestionReviewActionsProps {
  suggestion: PlannerSuggestion;
  dict: Dictionary["inbox"];
}

/**
 * Accept / Edit / Reject controls for a pending suggestion. Each is a Server
 * Action; Accept routes to the existing module service, so no client-side
 * business logic lives here.
 */
export function SuggestionReviewActions({ suggestion, dict }: SuggestionReviewActionsProps) {
  const [editing, setEditing] = useState(false);

  const [acceptState, acceptAction, acceptPending] = useActionState<ActionResult, FormData>(
    acceptPlannerSuggestionAction,
    {},
  );
  const [rejectState, rejectAction, rejectPending] = useActionState<ActionResult, FormData>(
    rejectPlannerSuggestionAction,
    {},
  );
  const [editState, editAction, editPending] = useActionState<ActionResult, FormData>(
    async (prev, formData) => {
      const result = await editPlannerSuggestionAction(prev, formData);
      if (!result.error && !result.fieldErrors) setEditing(false);
      return result;
    },
    {},
  );

  const error = acceptState.error || rejectState.error || editState.error;

  return (
    <div className="mt-3 border-t border-border-soft pt-3">
      {error && (
        <p className="mb-2 text-xs text-danger" role="alert">
          {error}
        </p>
      )}

      {editing ? (
        <form action={editAction} className="flex flex-col gap-2">
          <input type="hidden" name="suggestionId" value={suggestion.id} />
          <Input name="title" label={dict.edit} defaultValue={suggestion.title} required />
          <textarea
            name="description"
            rows={2}
            defaultValue={suggestion.description ?? ""}
            className="w-full resize-none rounded-(--neu-radius-md) bg-surface-sunken px-3 py-2 text-sm text-text-primary shadow-neu-inset focus:outline-none focus:ring-2 focus:ring-accent-yellow/40"
          />
          <div className="flex gap-2">
            <Button type="submit" isLoading={editPending} variant="primary">
              {dict.save}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              {dict.cancel}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <form action={acceptAction}>
            <input type="hidden" name="suggestionId" value={suggestion.id} />
            <Button type="submit" isLoading={acceptPending} variant="primary">
              {dict.accept}
            </Button>
          </form>
          <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
            {dict.edit}
          </Button>
          <form action={rejectAction}>
            <input type="hidden" name="suggestionId" value={suggestion.id} />
            <Button type="submit" isLoading={rejectPending} variant="ghost">
              {dict.reject}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
