"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/ui/button";
import type { FirstAction } from "../types/onboarding.types";
import { FIRST_ACTION_ROUTE } from "../constants/first-action-routes";
import { selectFirstActionAction } from "../actions/select-first-action.action";

interface FirstActionCtaProps {
  action: FirstAction;
  label: string;
  variant?: "primary" | "secondary";
  disabled?: boolean;
  /**
   * When the creation surface already lives on this page (the Inbox capture box),
   * focus it instead of navigating to the page the user is standing on.
   */
  focusTargetId?: string;
  /**
   * When the creation form is a modal on this very page (tasks, subscriptions),
   * open it instead of navigating. Navigating would reload the page the user is
   * already looking at.
   */
  onActivate?: () => void;
}

/**
 * The button that turns an action-driven empty state into a guided flow (Phase B
 * / B6).
 *
 * It does not merely link to a form. It first records the first action, which is
 * what lets `reconcileFirstAction` seed a draft once the entity appears — the CTA
 * and the wizard tile enter the exact same funnel. The write is best-effort: a
 * failed funnel row must never trap the user on an empty screen, so navigation
 * happens either way.
 */
export function FirstActionCta({
  action,
  label,
  variant = "primary",
  disabled,
  focusTargetId,
  onActivate,
}: FirstActionCtaProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function go() {
    startTransition(async () => {
      // Idempotent and self-guarding: a completed or dismissed funnel is not reopened.
      // `source` is what makes the B7 empty-state CTA rate computable at all.
      await selectFirstActionAction({ firstAction: action, source: "empty_state" });

      if (onActivate) {
        onActivate();
        return;
      }

      if (focusTargetId) {
        const target = document.getElementById(focusTargetId);
        if (target) {
          // Scrolling is cosmetic and not universally implemented; focusing is the
          // point. Never let the former take the latter down with it.
          target.scrollIntoView?.({ block: "center", behavior: "smooth" });
          target.focus();
          return;
        }
      }

      router.push(FIRST_ACTION_ROUTE[action]);
    });
  }

  return (
    <Button type="button" variant={variant} onClick={go} isLoading={isPending} disabled={disabled}>
      {label}
    </Button>
  );
}
