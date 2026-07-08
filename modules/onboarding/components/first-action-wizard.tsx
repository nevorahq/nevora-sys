"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileTextIcon, RepeatIcon, CheckSquareIcon, InboxIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { ROUTES } from "@/shared/config/routes";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import type { FirstAction } from "../types/onboarding.types";
import type { WizardState } from "../queries/get-wizard-state";
import { FIRST_ACTION_ROUTE as ACTION_ROUTE } from "../constants/first-action-routes";
import { selectFirstActionAction } from "../actions/select-first-action.action";
import { dismissWizardAction } from "../actions/dismiss-wizard.action";

interface FirstActionWizardProps {
  state: WizardState;
  dict: Dictionary["firstRun"];
}

const ACTION_ICON: Record<FirstAction, typeof FileTextIcon> = {
  upload_document: FileTextIcon,
  add_subscription: RepeatIcon,
  create_task: CheckSquareIcon,
  capture_inbox_item: InboxIcon,
};

/**
 * The Phase B first-run surface, rendered above the Action Center feed.
 *
 * It orchestrates, it does not duplicate: every tile deep-links to the module
 * that already owns that creation form. The draft is seeded server-side when the
 * user comes back (see reconcileFirstAction), which is why there is no success
 * callback to wire here.
 */
export function FirstActionWizard({ state, dict }: FirstActionWizardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (!state.visible) return null;

  const choose = (action: FirstAction) => {
    startTransition(async () => {
      const result = await selectFirstActionAction({ firstAction: action, source: "wizard" });
      if (!result.error) router.push(ACTION_ROUTE[action]);
    });
  };

  const dismiss = () => startTransition(() => void dismissWizardAction());

  return (
    <section className="soft-card p-5" aria-label={dict.title}>
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            <SparklesIcon size={16} strokeWidth={1.5} className="text-accent-yellow" />
            {state.step === "review_draft" ? dict.draftTitle : dict.title}
          </h2>
          <p className="mt-1 text-xs text-text-muted">
            {state.step === "review_draft"
              ? dict.draftBody
              : state.step === "awaiting_entity"
                ? dict.awaitingBody
                : dict.subtitle}
          </p>
        </div>
        <Button type="button" variant="ghost" onClick={dismiss} disabled={isPending}>
          {dict.skip}
        </Button>
      </header>

      {state.step === "choose" && <ChooseStep dict={dict} onChoose={choose} disabled={isPending} />}

      {state.step === "awaiting_entity" && state.selectedAction && (
        <AwaitingStep dict={dict} action={state.selectedAction} />
      )}

      {state.step === "review_draft" && <ReviewStep dict={dict} />}
    </section>
  );
}

function ChooseStep({
  dict,
  onChoose,
  disabled,
}: {
  dict: Dictionary["firstRun"];
  onChoose: (action: FirstAction) => void;
  disabled: boolean;
}) {
  const tiles: Array<{ action: FirstAction; label: string; hint: string }> = [
    { action: "upload_document", label: dict.uploadDocument, hint: dict.uploadDocumentHint },
    { action: "add_subscription", label: dict.addSubscription, hint: dict.addSubscriptionHint },
    { action: "create_task", label: dict.createTask, hint: dict.createTaskHint },
    { action: "capture_inbox_item", label: dict.captureInboxItem, hint: dict.captureInboxItemHint },
  ];

  return (
    <>
      <p className="mt-4 text-xs text-text-muted">{dict.chooseHint}</p>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {tiles.map(({ action, label, hint }) => {
          const Icon = ACTION_ICON[action];
          return (
            <li key={action}>
              <button
                type="button"
                onClick={() => onChoose(action)}
                disabled={disabled}
                className="soft-inset flex w-full items-start gap-3 rounded-(--neu-radius-lg) p-4 text-left transition disabled:opacity-60"
              >
                <span className="soft-icon-button h-9 w-9 shrink-0 pointer-events-none">
                  <Icon size={16} strokeWidth={1.5} className="text-text-muted" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-text-primary">{label}</span>
                  <span className="mt-0.5 block text-xs text-text-muted">{hint}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function AwaitingStep({ dict, action }: { dict: Dictionary["firstRun"]; action: FirstAction }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <p className="text-sm font-medium text-text-secondary">{dict.awaitingTitle}</p>
      <Link href={ACTION_ROUTE[action]}>
        <Button type="button" variant="primary">
          {dict.awaitingCta}
        </Button>
      </Link>
    </div>
  );
}

/**
 * The draft lives in the Inbox review queue, which is where accept / edit /
 * reject already exist. Sending the user there beats rebuilding those controls.
 */
function ReviewStep({ dict }: { dict: Dictionary["firstRun"] }) {
  return (
    <div className="mt-4">
      <Link href={ROUTES.inbox}>
        <Button type="button" variant="primary">
          {dict.draftCta}
        </Button>
      </Link>
    </div>
  );
}
