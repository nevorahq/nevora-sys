"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClockIcon, CheckIcon, ExternalLinkIcon, SearchIcon, XCircleIcon } from "lucide-react";
import { addDaysISO, type RenewalDecisionAction, type RenewalInboxItem } from "@nevora/subscriptions-contracts";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import { Toast } from "@/shared/ui/toast";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { applyRenewalDecisionAction } from "../actions/apply-renewal-decision.action";

interface RenewalDecisionActionsProps {
  item: RenewalInboxItem;
  dict: Dictionary;
  canWrite: boolean;
  compact?: boolean;
}

function interpolate(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replace(`{${key}}`, String(value)),
    template,
  );
}

export function RenewalDecisionActions({ item, dict, canWrite, compact = false }: RenewalDecisionActionsProps) {
  const t = dict.subscriptions.renewal;
  const router = useRouter();
  const [selectedAction, setSelectedAction] = useState<RenewalDecisionAction | "choose" | null>(null);
  const [note, setNote] = useState("");
  const [createCancellationTask, setCreateCancellationTask] = useState(true);
  const [snoozeDate, setSnoozeDate] = useState(() => addDaysISO(new Date().toISOString().slice(0, 10), 1));
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isResolved = item.status === "keep" || item.status === "wont_renew";
  const title = useMemo(() => {
    switch (selectedAction) {
      case "keep": return interpolate(t.keepTitle, { name: item.subscription.name });
      case "review": return t.reviewTitle;
      case "wont_renew": return interpolate(t.wontRenewTitle, { name: item.subscription.name });
      case "snooze": return t.laterTitle;
      default: return t.renewalDecision;
    }
  }, [item.subscription.name, selectedAction, t]);

  function open(action: RenewalDecisionAction | "choose") {
    setError(null);
    setNote("");
    setSelectedAction(action);
  }

  function close() {
    if (isPending) return;
    setSelectedAction(null);
    setError(null);
  }

  function submit(action: RenewalDecisionAction) {
    setError(null);
    startTransition(async () => {
      const result = await applyRenewalDecisionAction({
        renewalCaseId: item.id,
        action,
        note: note.trim() || null,
        snoozedUntil: action === "snooze" ? `${snoozeDate}T09:00:00.000Z` : null,
        createCancellationTask,
        expectedUpdatedAt: item.updated_at,
      });
      if (!result.ok) {
        setError(result.error ?? t.saveFailed);
        return;
      }
      const message = action === "keep"
        ? interpolate(t.savedKeep, { name: item.subscription.name })
        : action === "review"
          ? t.savedReview
          : action === "wont_renew"
            ? t.savedWontRenew
            : action === "snooze"
              ? interpolate(t.savedSnooze, { date: snoozeDate })
              : t.noDecisionsBody;
      setSelectedAction(null);
      setToast(message);
      router.refresh();
    });
  }

  const buttons = (
    <>
      <Button type="button" variant="secondary" onClick={() => open("keep")} disabled={!canWrite} className="px-4 py-2 text-xs">
        <CheckIcon size={14} /> {t.keep}
      </Button>
      <Button type="button" variant="secondary" onClick={() => open("review")} disabled={!canWrite} className="px-4 py-2 text-xs">
        <SearchIcon size={14} /> {t.review}
      </Button>
      <Button type="button" variant="ghost" onClick={() => open("wont_renew")} disabled={!canWrite} className="px-4 py-2 text-xs text-danger">
        <XCircleIcon size={14} /> {t.wontRenew}
      </Button>
      <Button type="button" variant="ghost" onClick={() => open("snooze")} disabled={!canWrite} className="px-4 py-2 text-xs">
        <CalendarClockIcon size={14} /> {t.later}
      </Button>
    </>
  );

  return (
    <>
      {isResolved ? (
        <Button type="button" variant="secondary" onClick={() => submit("reopen")} disabled={!canWrite || isPending} className="px-4 py-2 text-xs">
          {t.changeDecision}
        </Button>
      ) : compact ? (
        <>
          <div className="hidden flex-wrap gap-2 sm:flex">{buttons}</div>
          <Button type="button" onClick={() => open("choose")} disabled={!canWrite} className="sm:hidden px-4 py-2 text-xs">
            {t.decide}
          </Button>
        </>
      ) : (
        <div className="flex flex-wrap gap-2">{buttons}</div>
      )}

      <Modal isOpen={selectedAction !== null} onClose={close} title={title} closeLabel={dict.common.close}>
        {selectedAction === "choose" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Button type="button" variant="secondary" onClick={() => setSelectedAction("keep")}><CheckIcon size={16} /> {t.keep}</Button>
            <Button type="button" variant="secondary" onClick={() => setSelectedAction("review")}><SearchIcon size={16} /> {t.review}</Button>
            <Button type="button" variant="secondary" onClick={() => setSelectedAction("wont_renew")}><XCircleIcon size={16} /> {t.wontRenew}</Button>
            <Button type="button" variant="secondary" onClick={() => setSelectedAction("snooze")}><CalendarClockIcon size={16} /> {t.later}</Button>
          </div>
        )}

        {selectedAction && selectedAction !== "choose" && selectedAction !== "reopen" && (
          <div className="space-y-5">
            {selectedAction === "keep" && <p className="text-sm leading-6 text-text-secondary">{t.keepBody}</p>}
            {selectedAction === "review" && <p className="text-sm leading-6 text-text-secondary">{t.reviewBody}</p>}
            {selectedAction === "wont_renew" && (
              <>
                <p className="rounded-(--neu-radius-md) border border-danger/20 bg-danger-soft px-4 py-3 text-sm leading-6 text-danger">{t.wontRenewWarning}</p>
                <label htmlFor={`cancel-task-${item.id}`} className="inline-flex cursor-pointer items-center gap-2.5 text-sm text-text-secondary">
                  <input id={`cancel-task-${item.id}`} type="checkbox" checked={createCancellationTask} onChange={(event) => setCreateCancellationTask(event.target.checked)} className="h-4 w-4 accent-[var(--accent-lilac)]" />
                  {t.createCancellationTask}
                </label>
                {item.subscription.url && (
                  <a href={item.subscription.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-medium text-text-secondary underline hover:text-text-primary">
                    <ExternalLinkIcon size={14} /> {t.openProvider}
                  </a>
                )}
              </>
            )}
            {selectedAction === "snooze" && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: t.tomorrow, days: 1 },
                    { label: t.in3Days, days: 3 },
                    { label: t.in7Days, days: 7 },
                  ].map((preset) => {
                    const date = addDaysISO(new Date().toISOString().slice(0, 10), preset.days);
                    return <Button key={preset.days} type="button" variant={snoozeDate === date ? "primary" : "secondary"} disabled={date > item.renewal_date} onClick={() => setSnoozeDate(date)} className="px-3 py-2 text-xs">{preset.label}</Button>;
                  })}
                </div>
                <Input id={`snooze-date-${item.id}`} type="date" label={t.chooseDate} min={addDaysISO(new Date().toISOString().slice(0, 10), 1)} max={item.renewal_date} value={snoozeDate} onChange={(event) => setSnoozeDate(event.target.value)} />
              </>
            )}
            {selectedAction !== "snooze" && (
              <div>
                <label htmlFor={`decision-note-${item.id}`} className="text-sm font-medium text-text-secondary">{t.note}</label>
                <textarea id={`decision-note-${item.id}`} value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} placeholder={t.notePlaceholder} className="soft-control mt-1.5 min-h-24 w-full resize-y px-4 py-3 text-sm" />
              </div>
            )}
            {error && <p className="text-sm text-danger" role="alert">{error}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" onClick={close} disabled={isPending}>{dict.common.close}</Button>
              <Button type="button" isLoading={isPending} onClick={() => submit(selectedAction)}>
                {selectedAction === "keep" ? t.confirmKeep : selectedAction === "review" ? t.startReview : selectedAction === "wont_renew" ? t.confirmWontRenew : t.snooze}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
