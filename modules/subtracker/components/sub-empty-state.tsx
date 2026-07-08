"use client";

import { useState } from "react";
import { RepeatIcon } from "lucide-react";
import { Modal } from "@/shared/ui/modal";
import { EmptyState } from "@/shared/ui/empty-state";
import { FirstActionCta } from "@/modules/onboarding/components/first-action-cta";
import { useAccessGate } from "@/modules/billing/components/access-state";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { CreateSubscriptionForm } from "./create-subscription-form";

interface SubEmptyStateProps {
  dict: Dictionary;
  defaultCurrency: string;
}

/**
 * Action-driven empty state (Phase B / B6).
 *
 * The CTA opens the same modal the header's Create button does — navigating to
 * ROUTES.subscriptions would reload the page the user is standing on. It also
 * records the first action, so a user who starts here enters the same funnel as
 * one who started from the wizard, and gets the same draft afterwards.
 */
export function SubEmptyState({ dict, defaultCurrency }: SubEmptyStateProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { blocked } = useAccessGate("write");

  return (
    <>
      <EmptyState
        icon={<RepeatIcon size={24} className="text-text-muted" strokeWidth={1.5} />}
        title={dict.firstRun.empty.subscriptionsTitle}
        description={dict.firstRun.empty.subscriptionsBody}
        actions={
          <FirstActionCta
            action="add_subscription"
            label={dict.firstRun.addSubscription}
            disabled={blocked}
            onActivate={() => setIsOpen(true)}
          />
        }
      />

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={dict.subscriptions.form.addButton}
        closeLabel={dict.common.close}
      >
        {isOpen && (
          <CreateSubscriptionForm
            dict={dict}
            defaultCurrency={defaultCurrency}
            onSuccess={() => setIsOpen(false)}
          />
        )}
      </Modal>
    </>
  );
}
