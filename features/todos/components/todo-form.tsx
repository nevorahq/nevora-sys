"use client";

import { useActionState, useRef, useState } from "react";
import { CalendarIcon, CameraIcon, FileTextIcon, PaperclipIcon, Repeat2Icon, Trash2Icon } from "lucide-react";
import { createTodoAction } from "../actions/create-todo.action";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { Button } from "@/shared/ui/button";
import { TODO_PRIORITIES } from "@/entities/todo/constants";
import type { ActionResult } from "@/lib/validators/common";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { DOCUMENT_MAX_FILES, DOCUMENT_UPLOAD_ACCEPT } from "@/modules/documents/constants/document.constants";
import { validateDocumentFiles } from "@/modules/documents/services/validate-document-file";

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
  /** Pre-attach the new task to this project (renders a hidden field). */
  fixedProjectId?: string;
  /** Optional project options for an inline selector (ignored if fixedProjectId set). */
  projects?: { id: string; name: string }[];
}

export function TodoForm({ dict, onSuccess, fixedProjectId, projects }: TodoFormProps) {
  const t = dict.todos.form;
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  const [state, formAction, isPending] = useActionState<ActionResult, FormData>(
    async (prevState, formData) => {
      const result = await createTodoAction(prevState, formData);
      // The task is always created. A draft document is created only when files
      // are attached — we send them to a single server process that creates the
      // document + attachments atomically (and rolls back on failure).
      if (result.taskId && files.length > 0) {
        const uploadData = new FormData();
        files.forEach((file) => uploadData.append("files", file));
        const response = await fetch(`/api/tasks/${result.taskId}/document`, { method: "POST", body: uploadData });
        if (!response.ok) {
          const payload = await response.json() as { error?: string };
          return { error: payload.error ?? "Task created, but attachments could not be uploaded." };
        }
      }
      if (!result.error && !result.fieldErrors) {
        formRef.current?.reset();
        setFiles([]);
        setAttachmentError(null);
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

  function addFiles(nextFiles: FileList | null) {
    if (!nextFiles) return;
    const merged = [...files, ...Array.from(nextFiles)];
    const validation = validateDocumentFiles(merged);
    if (!validation.ok) {
      setAttachmentError(validation.message);
      return;
    }
    setFiles(merged);
    setAttachmentError(null);
  }

  return (
    <form ref={formRef} action={formAction}>
      {state.error && (
        <div className="mb-3 rounded-(--neu-radius-md) bg-danger-soft border border-danger/20 px-4 py-3 text-sm text-danger" role="alert">
          {state.error}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="w-full">
          <Input
            id="title"
            name="title"
            placeholder={t.titlePlaceholder}
            required
            className="h-11 py-0"
            error={state.fieldErrors?.title?.[0]}
          />
        </div>

        <div className="w-full">
          <Select
            id="priority"
            name="priority"
            options={priorityOptions}
            defaultValue="medium"
            className="h-11 py-0"
            error={state.fieldErrors?.priority?.[0]}
          />
        </div>

        {/* Срок исполнения на создании не задаётся: дату можно установить
            только после перевода задачи в статус "in_progress". */}

        {/* Project assignment: hidden when fixed, a selector when options given. */}
        {fixedProjectId ? (
          <input type="hidden" name="project_id" value={fixedProjectId} />
        ) : (
          projects && projects.length > 0 && (
            <div className="w-full">
              <Select
                id="project_id"
                name="project_id"
                defaultValue=""
                options={[
                  { value: "", label: "No project" },
                  ...projects.map((p) => ({ value: p.id, label: p.name })),
                ]}
                className="h-11 py-0"
                error={state.fieldErrors?.project_id?.[0]}
              />
            </div>
          )
        )}

        <fieldset className="w-full" aria-label={t.recurrenceLabel}>
          <legend className="sr-only">{t.recurrenceLabel}</legend>
          <div className="flex h-11 rounded-(--neu-radius-md) border-2 border-border-strong bg-surface-sunken p-1 shadow-neu-inset focus-within:ring-2 focus-within:ring-focus-ring">
            <label
              title={t.oneTime}
              aria-label={t.oneTime}
              className="flex h-full flex-1 cursor-pointer items-center justify-center rounded-(--neu-radius-sm) text-text-muted transition-all hover:bg-surface hover:text-text-primary has-checked:scale-[1.02] has-checked:bg-text-primary has-checked:text-text-inverse has-checked:shadow-neu-card has-checked:ring-2 has-checked:ring-text-primary/20"
            >
              <input
                className="sr-only"
                type="radio"
                name="recurrence"
                value="none"
                defaultChecked
              />
              <CalendarIcon size={19} strokeWidth={2.75} aria-hidden />
            </label>
            <label
              title={t.monthly}
              aria-label={t.monthly}
              className="flex h-full flex-1 cursor-pointer items-center justify-center rounded-(--neu-radius-sm) text-text-muted transition-all hover:bg-surface hover:text-text-primary has-checked:scale-[1.02] has-checked:bg-text-primary has-checked:text-text-inverse has-checked:shadow-neu-card has-checked:ring-2 has-checked:ring-text-primary/20"
            >
              <input
                className="sr-only"
                type="radio"
                name="recurrence"
                value="monthly"
              />
              <Repeat2Icon size={19} strokeWidth={2.75} aria-hidden />
            </label>
          </div>
        </fieldset>

        <div className="rounded-(--neu-radius-md) border border-border-soft bg-surface-sunken p-3">
          <p className="mb-2 text-xs font-medium text-text-secondary">Attachments (optional)</p>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="secondary" className="h-10 px-3 py-0 text-xs" onClick={() => cameraInputRef.current?.click()}>
              <CameraIcon size={16} /> Take a photo
            </Button>
            <Button type="button" variant="secondary" className="h-10 px-3 py-0 text-xs" onClick={() => fileInputRef.current?.click()}>
              <PaperclipIcon size={16} /> Add files
            </Button>
          </div>
          <input ref={cameraInputRef} className="sr-only" type="file" accept="image/*" capture="environment" onChange={(event) => { addFiles(event.target.files); event.currentTarget.value = ""; }} />
          <input ref={fileInputRef} className="sr-only" type="file" multiple accept={DOCUMENT_UPLOAD_ACCEPT} onChange={(event) => { addFiles(event.target.files); event.currentTarget.value = ""; }} />
          {attachmentError && <p role="alert" className="mt-2 text-xs font-medium text-danger">{attachmentError}</p>}
          {files.length > 0 && <div className="mt-3 space-y-1.5">{files.map((file, index) => <div key={`${file.name}-${file.lastModified}-${index}`} className="flex items-center gap-2 rounded-(--neu-radius-sm) bg-surface px-2 py-1.5"><FileTextIcon size={14} className="shrink-0 text-text-muted" /><span className="min-w-0 flex-1 truncate text-xs text-text-primary">{file.name}</span><button type="button" onClick={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))} aria-label={`Remove ${file.name}`} className="p-1 text-text-muted hover:text-danger"><Trash2Icon size={14} /></button></div>)}</div>}
          <p className="mt-2 text-xs text-text-muted">Up to {DOCUMENT_MAX_FILES} files. 10 MB per file.</p>
        </div>

        <Button type="submit" isLoading={isPending} className="h-11 w-full py-0">
          {isPending ? dict.common.loading : t.createButton}
        </Button>
      </div>
    </form>
  );
}
