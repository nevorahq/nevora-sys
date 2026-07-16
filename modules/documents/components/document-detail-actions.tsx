"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Edit3Icon, Trash2Icon, XIcon } from "lucide-react";
import { updateDocumentAction } from "../actions/update-document.action";
import { deleteDocumentAction } from "../actions/delete-document.action";
import { DOCUMENT_STATUSES, DOCUMENT_TYPES } from "../constants/document.constants";
import type { Document } from "../types/document.types";
import type { ActionResult } from "@/lib/validators/common";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { ROUTES } from "@/shared/config/routes";

export function DocumentDetailActions({ document, canUpdate, canDelete, t }: {
  document: Document;
  canUpdate: boolean;
  canDelete: boolean;
  t: Dictionary["documents"];
}) {
  const d = t.detail;
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSubmitted, setDeleteSubmitted] = useState(false);
  const deleteSubmittedRef = useRef(false);
  const [isDeleting, startDelete] = useTransition();
  const [state, formAction, isSaving] = useActionState<ActionResult, FormData>(
    async (previous, formData) => {
      const result = await updateDocumentAction(previous, formData);
      if (!result.error && !result.fieldErrors) {
        setEditing(false);
        router.refresh();
      }
      return result;
    },
    {},
  );

  const remove = () => startDelete(async () => {
    if (deleteSubmittedRef.current) return;
    deleteSubmittedRef.current = true;
    setDeleteSubmitted(true);
    setDeleteError(null);
    const result = await deleteDocumentAction(document.id);
    if (result.error) {
      setDeleteError(result.error);
      deleteSubmittedRef.current = false;
      setDeleteSubmitted(false);
      return;
    }
    router.replace(ROUTES.documents);
    router.refresh();
  });

  if (!canUpdate && !canDelete) return null;

  return <>
    <div className="flex flex-wrap gap-2">
      {canUpdate && <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-primary hover:bg-surface-sunken"><Edit3Icon size={16} /> {d.edit}</button>}
      {canDelete && <button type="button" onClick={() => { setDeleteError(null); deleteSubmittedRef.current = false; setDeleteSubmitted(false); setConfirmingDelete(true); }} className="inline-flex items-center gap-2 rounded-lg border border-danger/30 px-3 py-2 text-sm font-medium text-danger hover:bg-danger-soft"><Trash2Icon size={16} /> {d.delete}</button>}
    </div>

    {editing && <div role="dialog" aria-modal="true" aria-label={d.editDocument} className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <form action={formAction} className="w-full max-w-2xl space-y-4 rounded-xl bg-surface p-5 shadow-xl">
        <div className="flex items-center justify-between"><h2 className="text-lg font-semibold text-text-primary">{d.editDocument}</h2><button type="button" onClick={() => setEditing(false)} aria-label={d.close}><XIcon size={20} /></button></div>
        <input type="hidden" name="documentId" value={document.id} />
        <label className="block text-sm font-medium text-text-primary">{d.titleField}<input name="title" defaultValue={document.title} required className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2" />{state.fieldErrors?.title?.[0] && <span className="mt-1 block text-xs text-danger">{state.fieldErrors.title[0]}</span>}</label>
        <label className="block text-sm font-medium text-text-primary">{d.notesField}<textarea name="content" defaultValue={document.content} rows={9} className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2" />{state.fieldErrors?.content?.[0] && <span className="mt-1 block text-xs text-danger">{state.fieldErrors.content[0]}</span>}</label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-text-primary">{d.typeField}<select name="doc_type" defaultValue={document.doc_type} className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2">{DOCUMENT_TYPES.map((type) => <option key={type} value={type}>{t.types[type]}</option>)}</select></label>
          <label className="block text-sm font-medium text-text-primary">{d.statusField}<select name="status" defaultValue={document.status} className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2">{DOCUMENT_STATUSES.map((status) => <option key={status} value={status}>{t.statuses[status]}</option>)}</select></label>
        </div>
        {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
        <div className="flex justify-end gap-2"><button type="button" onClick={() => setEditing(false)} className="rounded-lg px-3 py-2 text-sm font-medium text-text-secondary">{d.cancel}</button><button type="submit" disabled={isSaving} className="rounded-lg bg-text-primary px-4 py-2 text-sm font-semibold text-text-inverse shadow-neu-control hover:opacity-90 disabled:opacity-60">{isSaving ? d.saving : d.save}</button></div>
      </form>
    </div>}

    {confirmingDelete && <div role="dialog" aria-modal="true" aria-label={d.deleteConfirm} className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"><div className="w-full max-w-md rounded-xl bg-surface p-5 shadow-xl"><h2 className="text-lg font-semibold text-text-primary">{d.deleteQ}</h2><p className="mt-2 text-sm text-text-muted">“{document.title}” {d.deleteBodySuffix}</p>{deleteError && <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{deleteError}</p>}<div className="mt-5 flex justify-end gap-2"><button type="button" disabled={isDeleting || deleteSubmitted} onClick={() => setConfirmingDelete(false)} className="rounded-lg px-3 py-2 text-sm font-medium text-text-secondary">{d.cancel}</button><button type="button" disabled={isDeleting || deleteSubmitted} onClick={remove} className="rounded-lg bg-danger px-3 py-2 text-sm font-medium text-white disabled:opacity-60">{isDeleting || deleteSubmitted ? d.deleting : d.deleteConfirm}</button></div></div></div>}
  </>;
}
