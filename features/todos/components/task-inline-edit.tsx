"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckIcon, PencilIcon } from "lucide-react";
import { updateTaskInlineAction, type InlineTaskField } from "../actions/update-task-inline.action";
import { TODO_DESCRIPTION_MAX_LENGTH, TODO_TITLE_MAX_LENGTH } from "@/entities/todo/constants";
import { cn } from "@/shared/utils/cn";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

interface TaskInlineEditContextValue {
  enabled: boolean;
  activeField: InlineTaskField | null;
  savingField: InlineTaskField | null;
  title: string;
  description: string;
  errors: Partial<Record<InlineTaskField, string>>;
  toggleEnabled: () => void;
  beginEditing: (field: InlineTaskField) => void;
  cancelEditing: (field: InlineTaskField) => void;
  saveField: (field: InlineTaskField, value: string) => Promise<void>;
  dict: Dictionary;
}

const TaskInlineEditContext = createContext<TaskInlineEditContextValue | null>(null);

function useTaskInlineEdit(): TaskInlineEditContextValue {
  const value = useContext(TaskInlineEditContext);
  if (!value) throw new Error("Task inline edit components require TaskInlineEditProvider");
  return value;
}

export function TaskInlineEditProvider({
  taskId,
  initialTitle,
  initialDescription,
  canEdit,
  dict,
  children,
}: {
  taskId: string;
  initialTitle: string;
  initialDescription: string;
  canEdit: boolean;
  dict: Dictionary;
  children: ReactNode;
}) {
  const [enabled, setEnabled] = useState(false);
  const [activeField, setActiveField] = useState<InlineTaskField | null>(null);
  const [savingField, setSavingField] = useState<InlineTaskField | null>(null);
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [errors, setErrors] = useState<Partial<Record<InlineTaskField, string>>>({});
  const savingRef = useRef<InlineTaskField | null>(null);

  const beginEditing = useCallback((field: InlineTaskField) => {
    if (!canEdit || !enabled || savingRef.current) return;
    setErrors((current) => ({ ...current, [field]: undefined }));
    setActiveField(field);
  }, [canEdit, enabled]);

  const cancelEditing = useCallback((field: InlineTaskField) => {
    setErrors((current) => ({ ...current, [field]: undefined }));
    setActiveField((current) => current === field ? null : current);
  }, []);

  const saveField = useCallback(async (field: InlineTaskField, draft: string) => {
    if (savingRef.current) return;

    const nextValue = field === "title" ? draft.trim() : draft;
    if (field === "title" && !nextValue) {
      setErrors((current) => ({ ...current, title: dict.todos.inlineEdit.titleRequired }));
      setEnabled(true);
      setActiveField("title");
      return;
    }

    const currentValue = field === "title" ? title : description;
    if (nextValue === currentValue) {
      setErrors((current) => ({ ...current, [field]: undefined }));
      setActiveField((current) => current === field ? null : current);
      return;
    }

    savingRef.current = field;
    setSavingField(field);
    setErrors((current) => ({ ...current, [field]: undefined }));

    const result = await updateTaskInlineAction(taskId, field, nextValue);
    savingRef.current = null;
    setSavingField(null);

    if (result.error) {
      setErrors((current) => ({ ...current, [field]: dict.todos.inlineEdit.saveFailed }));
      setEnabled(true);
      setActiveField(field);
      return;
    }

    const savedValue = result.value ?? nextValue;
    if (field === "title") setTitle(savedValue);
    else setDescription(savedValue);
    setActiveField((current) => current === field ? null : current);
  }, [description, dict.todos.inlineEdit.saveFailed, dict.todos.inlineEdit.titleRequired, taskId, title]);

  return (
    <TaskInlineEditContext.Provider value={{
      enabled,
      activeField,
      savingField,
      title,
      description,
      errors,
      toggleEnabled: () => {
        if (!canEdit || savingRef.current) return;
        setEnabled((current) => !current);
      },
      beginEditing,
      cancelEditing,
      saveField,
      dict,
    }}>
      {children}
    </TaskInlineEditContext.Provider>
  );
}

export function TaskEditModeButton() {
  const { enabled, activeField, savingField, toggleEnabled, dict } = useTaskInlineEdit();
  const handledOnPointerDown = useRef(false);
  return (
    <button
      type="button"
      onPointerDown={() => {
        // Pointer down happens before the active input's blur. Turn off the
        // global mode first; blur will still autosave that field.
        if (enabled && activeField) {
          handledOnPointerDown.current = true;
          toggleEnabled();
          window.setTimeout(() => { handledOnPointerDown.current = false; }, 0);
        }
      }}
      onClick={() => {
        if (handledOnPointerDown.current) {
          handledOnPointerDown.current = false;
          return;
        }
        toggleEnabled();
      }}
      disabled={savingField !== null}
      aria-pressed={enabled}
      className={cn(
        "inline-flex items-center gap-2 rounded-(--neu-radius-pill) px-3 py-2 text-sm font-medium transition-colors",
        enabled ? "bg-text-primary text-text-inverse" : "soft-control text-text-secondary hover:text-text-primary",
        savingField && "opacity-50",
      )}
    >
      {enabled ? <CheckIcon size={15} /> : <PencilIcon size={15} />}
      {savingField ? dict.todos.inlineEdit.saving : enabled ? dict.todos.inlineEdit.done : dict.todos.inlineEdit.edit}
    </button>
  );
}

export function InlineTaskTitle() {
  const state = useTaskInlineEdit();
  const [draft, setDraft] = useState(state.title);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelOnBlur = useRef(false);

  useEffect(() => {
    if (state.activeField === "title") {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [state.activeField]);

  if (state.activeField === "title") {
    return (
      <div className="min-w-0">
        <input
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (cancelOnBlur.current) {
              cancelOnBlur.current = false;
              state.cancelEditing("title");
              return;
            }
            void state.saveField("title", draft);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              cancelOnBlur.current = true;
              setDraft(state.title);
              event.currentTarget.blur();
            }
          }}
          disabled={state.savingField === "title"}
          maxLength={TODO_TITLE_MAX_LENGTH}
          aria-label={state.dict.todos.inlineEdit.editTitle}
          aria-invalid={Boolean(state.errors.title)}
          className="soft-control h-11 w-full min-w-0 px-3 text-2xl font-semibold text-text-primary"
        />
        {state.errors.title && <p role="alert" className="mt-1 text-xs text-danger">{state.errors.title}</p>}
      </div>
    );
  }

  return state.enabled ? (
    <button
      type="button"
      onClick={() => {
        setDraft(state.title);
        state.beginEditing("title");
      }}
      aria-label={state.dict.todos.inlineEdit.editTitle}
      className="-m-2 block max-w-full rounded-(--neu-radius-sm) p-2 text-left hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
    >
      <span className="block truncate text-2xl font-semibold text-text-primary">{state.title}</span>
    </button>
  ) : <h1 className="text-2xl font-semibold text-text-primary">{state.title}</h1>;
}

export function InlineTaskDescription() {
  const state = useTaskInlineEdit();
  const [draft, setDraft] = useState(state.description);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cancelOnBlur = useRef(false);

  useEffect(() => {
    if (state.activeField !== "description") return;
    textareaRef.current?.focus();
  }, [state.activeField]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || state.activeField !== "description") return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [draft, state.activeField]);

  if (state.activeField === "description") {
    return (
      <div>
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (cancelOnBlur.current) {
              cancelOnBlur.current = false;
              state.cancelEditing("description");
              return;
            }
            void state.saveField("description", draft);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              cancelOnBlur.current = true;
              setDraft(state.description);
              event.currentTarget.blur();
            }
          }}
          disabled={state.savingField === "description"}
          maxLength={TODO_DESCRIPTION_MAX_LENGTH}
          aria-label={state.dict.todos.inlineEdit.editDescription}
          className="soft-control min-h-28 w-full resize-none px-3 py-2 text-sm leading-6 text-text-primary"
        />
        {state.errors.description && <p role="alert" className="mt-1 text-xs text-danger">{state.errors.description}</p>}
      </div>
    );
  }

  const content = state.description || state.dict.todos.inlineEdit.addDescription;
  return state.enabled ? (
    <button
      type="button"
      onClick={() => {
        setDraft(state.description);
        state.beginEditing("description");
      }}
      aria-label={state.dict.todos.inlineEdit.editDescription}
      className={cn(
        "mt-3 block min-h-12 w-full rounded-(--neu-radius-sm) p-2 text-left text-sm leading-6 hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
        state.description ? "whitespace-pre-wrap text-text-primary" : "text-text-muted",
      )}
    >
      {content}
    </button>
  ) : (
    <p className={cn("mt-3 whitespace-pre-wrap text-sm leading-6", state.description ? "text-text-primary" : "text-text-muted")}>
      {content}
    </p>
  );
}
