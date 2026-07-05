"use client";

import { useActionState, useState } from "react";
import { CheckIcon, PencilIcon, Trash2Icon, XIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import type { ActionResult } from "@/lib/validators/common";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { cn } from "@/shared/utils/cn";
import { updatePlannerEntryAction } from "../actions/update-planner-entry.action";
import { deletePlannerEntryAction } from "../actions/delete-planner-entry.action";

interface PlannerEntryEditorProps {
  entryId: string;
  rawText: string | null;
  dict: Dictionary["inbox"];
  canUpdate: boolean;
  canDelete: boolean;
  children: ReactNode;
}

export function PlannerEntryEditor({
  entryId,
  rawText,
  dict,
  canUpdate,
  canDelete,
  children,
}: PlannerEntryEditorProps) {
  const [editing, setEditing] = useState(false);
  const [updateState, updateAction, updatePending] = useActionState<ActionResult, FormData>(
    async (prev, formData) => {
      const result = await updatePlannerEntryAction(prev, formData);
      if (!result.error && !result.fieldErrors) setEditing(false);
      return result;
    },
    {},
  );
  const [deleteState, deleteAction, deletePending] = useActionState<ActionResult, FormData>(
    deletePlannerEntryAction,
    {},
  );

  const error =
    updateState.error ||
    deleteState.error ||
    updateState.fieldErrors?.rawText?.[0];

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        {editing ? (
          <form action={updateAction} className="flex flex-col gap-2">
            <input type="hidden" name="entryId" value={entryId} />
            <textarea
              name="rawText"
              rows={4}
              defaultValue={rawText ?? ""}
              required
              autoFocus
              className="w-full resize-y rounded-(--neu-radius-md) bg-surface-sunken px-3 py-2 text-sm text-text-primary shadow-neu-inset focus:outline-none focus:ring-2 focus:ring-accent-yellow/40"
            />
            <div className="flex items-center gap-2">
              <IconButton type="submit" label={dict.save} disabled={updatePending}>
                <CheckIcon size={16} aria-hidden="true" />
              </IconButton>
              <IconButton
                type="button"
                label={dict.cancel}
                disabled={updatePending}
                onClick={() => setEditing(false)}
              >
                <XIcon size={16} aria-hidden="true" />
              </IconButton>
            </div>
          </form>
        ) : (
          <p className="text-sm text-text-primary whitespace-pre-wrap">{rawText}</p>
        )}

        {error && (
          <p className="mt-2 text-xs text-danger" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {children}
        {(canUpdate || canDelete) && (
          <div className="flex items-center gap-1">
            {canUpdate && !editing && (
              <IconButton type="button" label={dict.edit} onClick={() => setEditing(true)}>
                <PencilIcon size={15} aria-hidden="true" />
              </IconButton>
            )}
            {canDelete && (
              <form
                action={deleteAction}
                onSubmit={(event) => {
                  if (!window.confirm(dict.deleteConfirm)) event.preventDefault();
                }}
              >
                <input type="hidden" name="entryId" value={entryId} />
                <IconButton
                  type="submit"
                  label={dict.delete}
                  disabled={deletePending}
                  className="hover:text-danger focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--danger)_25%,transparent),var(--neu-shadow-control)]"
                >
                  <Trash2Icon size={15} aria-hidden="true" />
                </IconButton>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

type IconButtonProps = ComponentProps<"button"> & {
  label: string;
};

function IconButton({ label, className, children, ...props }: IconButtonProps) {
  return (
    <button
      {...props}
      aria-label={label}
      title={label}
      className={cn("soft-icon-button h-8 w-8 disabled:pointer-events-none disabled:opacity-50", className)}
    >
      {children}
    </button>
  );
}
