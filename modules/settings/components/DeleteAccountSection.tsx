"use client";

import { useActionState, useState, useTransition } from "react";
import {
  requestAccountDeletion,
  cancelAccountDeletion,
} from "../actions/delete-account";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import type { SettingsActionState } from "../types/settings.types";

interface DeleteAccountSectionProps {
  email: string;
  graceDays: number;
  hasPassword: boolean;
  pending: { purgeAfter: string } | null;
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
}: DeleteAccountSectionProps) {
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
          <h2 className="text-base font-semibold text-danger">
            Account scheduled for deletion
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            Your account and its personal data will be permanently deleted on{" "}
            <strong>{formatDate(pending.purgeAfter)}</strong>. You can cancel any
            time before then to keep your account.
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
          {cancelling ? "Cancelling…" : "Cancel deletion"}
        </Button>
      </section>
    );
  }

  return (
    <section className="soft-card space-y-4 border border-danger/30 p-5 sm:p-6">
      <div>
        <h2 className="text-base font-semibold text-danger">Delete account</h2>
        <p className="mt-1 text-sm text-text-muted">
          Permanently delete your account and personal data. Deletion is
          scheduled with a {graceDays}-day grace period — you can cancel within
          that window before anything is erased.
        </p>
      </div>

      {!open ? (
        <Button type="button" variant="danger" onClick={() => setOpen(true)}>
          Delete account…
        </Button>
      ) : (
        <form action={action} className="space-y-4 border-t border-border-soft pt-4">
          {state.blockingOrgs && state.blockingOrgs.length > 0 && (
            <div className="rounded-md border border-danger/30 bg-danger/5 p-3 text-sm">
              <p className="font-medium text-danger">
                You are the only owner of these organizations:
              </p>
              <ul className="mt-1 list-disc pl-5 text-text-muted">
                {state.blockingOrgs.map((o) => (
                  <li key={o.name}>
                    {o.name} — {o.otherActiveMembers} other member
                    {o.otherActiveMembers === 1 ? "" : "s"}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-text-muted">
                Transfer ownership or remove the members first.
              </p>
            </div>
          )}

          <Input
            id="confirmation"
            name="confirmation"
            label={`Type your email (${email}) to confirm`}
            autoComplete="off"
            error={state.fieldErrors?.confirmation?.[0]}
            required
          />

          {hasPassword && (
            <Input
              id="password"
              name="password"
              type="password"
              label="Your password"
              autoComplete="current-password"
              error={state.fieldErrors?.password?.[0]}
              required
            />
          )}

          <Input
            id="reason"
            name="reason"
            label="Reason (optional)"
            error={state.fieldErrors?.reason?.[0]}
          />

          {state.error && <p className="text-sm text-danger">{state.error}</p>}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="danger" isLoading={submitting}>
              {submitting ? "Scheduling…" : `Schedule deletion`}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
