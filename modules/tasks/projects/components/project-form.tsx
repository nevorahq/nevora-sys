"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/utils/cn";
import { projectDetailUrl } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";
import { createProjectAction } from "../actions/create-project.action";
import { updateProjectAction } from "../actions/update-project.action";
import {
  PROJECT_STATUSES,
  PROJECT_PRIORITIES,
  PROJECT_COLORS,
} from "../constants/project.constants";
import type { Project } from "../types/project.types";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

interface ProjectFormProps {
  /** When set, the form edits this project; otherwise it creates a new one. */
  project?: Project;
  onSuccess?: () => void;
  t: Dictionary["projects"];
}

export function ProjectForm({ project, onSuccess, t }: ProjectFormProps) {
  const router = useRouter();
  const isEdit = Boolean(project);
  const statusOptions = PROJECT_STATUSES.filter((s) => s !== "archived").map((s) => ({
    value: s,
    label: t.statuses[s],
  }));
  const priorityOptions = PROJECT_PRIORITIES.map((p) => ({
    value: p,
    label: t.priorities[p],
  }));

  const [state, formAction, isPending] = useActionState<ActionResult, FormData>(
    async (prevState, formData) => {
      const result = isEdit
        ? await updateProjectAction(prevState, formData)
        : await createProjectAction(prevState, formData);

      if (!result.error && !result.fieldErrors) {
        onSuccess?.();
        // Create returns the new id in `taskId` → jump to the detail page.
        if (!isEdit && result.taskId) {
          router.push(projectDetailUrl(result.taskId));
        } else {
          router.refresh();
        }
      }
      return result;
    },
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {project && <input type="hidden" name="projectId" value={project.id} />}

      {state.error && (
        <div
          className="rounded-(--neu-radius-md) border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger"
          role="alert"
        >
          {state.error}
        </div>
      )}

      <Input
        id="name"
        name="name"
        label={t.name}
        placeholder={t.namePlaceholder}
        required
        defaultValue={project?.name}
        error={state.fieldErrors?.name?.[0]}
      />

      <div>
        <label htmlFor="description" className="mb-1.5 block text-sm font-medium text-text-secondary">
          {t.description}
        </label>
        <textarea
          id="description"
          name="description"
          rows={2}
          placeholder={t.descriptionPlaceholder}
          defaultValue={project?.description}
          className="soft-control w-full px-4 py-2.5 text-sm"
        />
        {state.fieldErrors?.description?.[0] && (
          <p className="mt-1 text-xs text-danger">{state.fieldErrors.description[0]}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Select
          id="status"
          name="status"
          label={t.status}
          options={statusOptions}
          defaultValue={project?.status ?? "active"}
          error={state.fieldErrors?.status?.[0]}
        />
        <Select
          id="priority"
          name="priority"
          label={t.priority}
          options={priorityOptions}
          defaultValue={project?.priority ?? "medium"}
          error={state.fieldErrors?.priority?.[0]}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input
          id="start_date"
          name="start_date"
          type="date"
          label={t.startDate}
          defaultValue={project?.start_date ?? ""}
        />
        <Input
          id="due_date"
          name="due_date"
          type="date"
          label={t.dueDate}
          defaultValue={project?.due_date ?? ""}
        />
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-text-secondary">{t.color}</legend>
        <div className="flex flex-wrap gap-2">
          {PROJECT_COLORS.map((color, index) => {
            const defaultColor = project?.color ?? PROJECT_COLORS[0];
            return (
              <label key={color} className="cursor-pointer">
                <input
                  type="radio"
                  name="color"
                  value={color}
                  defaultChecked={defaultColor ? defaultColor === color : index === 0}
                  className="peer sr-only"
                />
                <span
                  className={cn(
                    "block h-7 w-7 rounded-full ring-2 ring-transparent transition-all",
                    "peer-checked:ring-text-primary peer-checked:scale-110",
                  )}
                  style={{ backgroundColor: color }}
                />
              </label>
            );
          })}
        </div>
      </fieldset>

      <Button type="submit" isLoading={isPending} className="mt-1 w-full">
        {isEdit ? t.saveChanges : t.createProject}
      </Button>
    </form>
  );
}
