"use client";

import { useActionState, useState, useTransition } from "react";
import {
  requestAccountDeletion,
  cancelAccountDeletion,
} from "../actions/delete-account";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import type { SettingsActionState } from "../types/settings.types";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

interface DeleteAccountSectionProps {
  email: string;
  graceDays: number;
  hasPassword: boolean;
  pending: { purgeAfter: string } | null;
  t: Dictionary["settings"];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function DeleteAccountSection({
  email,
  graceDays,
  hasPassword,
  pending,
  t: settings,
}: DeleteAccountSectionProps) {
  const t = settings.deleteAccount;
  const [state, action, submitting] = useActionState<SettingsActionState, FormData>(
    requestAccountDeletion,
    {},
  );
  const [open, setOpen] = useState(false);
  const [cancelling, startCancel] = useTransition();
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Already scheduled — show the reactivation panel instead of the delete form.
  if (pending) {
    return (
      <section className="soft-card space-y-4 border border-danger/30 p-5 sm:p-6">
        <div>
          <h2 className="text-base font-semibold text-danger">{t.scheduledTitle}</h2>
          <p className="mt-1 text-sm text-text-muted">
            {t.scheduledBodyPrefix} <strong>{formatDate(pending.purgeAfter)}</strong>
            {t.scheduledBodySuffix}
          </p>
        </div>
        {cancelError && <p className="text-sm text-danger">{cancelError}</p>}
        <Button
          type="button"
          variant="secondary"
          isLoading={cancelling}
          onClick={() =>
            startCancel(async () => {
              setCancelError(null);
              const res = await cancelAccountDeletion();
              if (res.error) setCancelError(res.error);
            })
          }
        >
          {cancelling ? t.cancelling : t.cancelDeletion}
        </Button>
      </section>
    );
  }

  return (
    <section className="soft-card space-y-4 border border-danger/30 p-5 sm:p-6">
      <div>
        <h2 className="text-base font-semibold text-danger">{t.title}</h2>
        <p className="mt-1 text-sm text-text-muted">{t.body.replace("{days}", String(graceDays))}</p>
      </div>

      {!open ? (
        <Button type="button" variant="danger" onClick={() => setOpen(true)}>
          {t.openButton}
        </Button>
      ) : (
        <form action={action} className="space-y-4 border-t border-border-soft pt-4">
          {state.blockingOrgs && state.blockingOrgs.length > 0 && (
            <div className="rounded-md border border-danger/30 bg-danger/5 p-3 text-sm">
              <p className="font-medium text-danger">{t.soleOwnerTitle}</p>
              <ul className="mt-1 list-disc pl-5 text-text-muted">
                {state.blockingOrgs.map((o) => (
                  <li key={o.name}>
                    {o.name} — {o.otherActiveMembers}{" "}
                    {o.otherActiveMembers === 1 ? t.soleOwnerMember : t.soleOwnerMembers}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-text-muted">{t.soleOwnerHint}</p>
            </div>
          )}

          <Input
            id="confirmation"
            name="confirmation"
            label={t.confirmLabel.replace("{email}", email)}
            autoComplete="off"
            error={state.fieldErrors?.confirmation?.[0]}
            required
          />

          {hasPassword && (
            <Input
              id="password"
              name="password"
              type="password"
              label={t.passwordLabel}
              autoComplete="current-password"
              error={state.fieldErrors?.password?.[0]}
              required
            />
          )}

          <Input
            id="reason"
            name="reason"
            label={t.reasonLabel}
            error={state.fieldErrors?.reason?.[0]}
          />

          {state.error && <p className="text-sm text-danger">{state.error}</p>}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="danger" isLoading={submitting}>
              {submitting ? t.scheduling : t.scheduleButton}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              {settings.common.cancel}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
