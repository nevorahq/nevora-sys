"use client";

import Link from "next/link";
import { createContext, useContext, useId } from "react";
import { AlertTriangleIcon, ArrowRightIcon, LockIcon } from "lucide-react";
import { ROUTES } from "@/shared/config/routes";
import { cn } from "@/shared/utils/cn";
import {
  getAccessStateView,
  isAccessIntentAllowed,
  type AccessCopy,
  type AccessGateIntent,
  type AccessStateView,
} from "../services/access-state-ui";
import type { OrgAccessState } from "../types/entitlement.types";

const AccessStateContext = createContext<AccessStateView>(getAccessStateView("developer_unlimited"));

export function AccessStateProvider({
  accessState,
  copy,
  children,
}: {
  accessState: OrgAccessState;
  /** Localized copy from `dict.access` (dashboard layout). Falls back to defaults. */
  copy?: AccessCopy;
  children: React.ReactNode;
}) {
  return (
    <AccessStateContext.Provider value={getAccessStateView(accessState, copy)}>
      {children}
    </AccessStateContext.Provider>
  );
}

export function useAccessState() {
  return useContext(AccessStateContext);
}

/** Resolve the localized blocked-action message for an intent from the view. */
function blockedMessageFor(access: AccessStateView, intent: AccessGateIntent): string {
  if (intent === "invite") return access.blocked.invite;
  if (intent === "execute") return access.blocked.execute;
  return access.banner ?? access.blocked.default;
}

export function useAccessGate(intent: AccessGateIntent = "write") {
  const access = useAccessState();
  const allowed = isAccessIntentAllowed(access.state, intent);
  return {
    access,
    allowed,
    blocked: !allowed,
    message: allowed ? "" : blockedMessageFor(access, intent),
  };
}

export function RestrictedActionTooltip({
  message,
  children,
  className,
}: {
  message?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const access = useAccessState();
  const text = message ?? access.blocked.default;
  const id = useId();
  return (
    <span className={cn("inline-flex", className)} title={text} aria-describedby={id}>
      {children}
      <span id={id} className="sr-only">
        {text}
      </span>
    </span>
  );
}

export function AccessGate({
  intent = "write",
  children,
  fallback = null,
}: {
  intent?: AccessGateIntent;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { blocked, message } = useAccessGate(intent);
  if (!blocked) return children;
  return fallback ?? (
    <RestrictedActionTooltip message={message}>
      <span aria-disabled="true" className="inline-flex cursor-not-allowed opacity-60">
        {children}
      </span>
    </RestrictedActionTooltip>
  );
}

export function PlanRequiredCTA({ label = "Billing" }: { label?: string }) {
  return (
    <Link
      href={ROUTES.billing}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-(--neu-radius-pill) bg-text-primary px-3 py-1.5 text-xs font-semibold text-text-inverse shadow-neu-control transition hover:shadow-neu-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
    >
      {label}
      <ArrowRightIcon size={13} aria-hidden="true" />
    </Link>
  );
}

export function BillingRequiredAlert({
  title,
  message,
  className,
}: {
  title?: string;
  message?: string | null;
  className?: string;
}) {
  const access = useAccessState();
  const text = message ?? access.banner ?? access.blocked.default;
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col gap-3 rounded-(--neu-radius-md) border border-accent-yellow/30 bg-accent-yellow-soft/60 p-4 text-sm text-text-primary sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <AlertTriangleIcon size={18} className="mt-0.5 shrink-0 text-accent-yellow" aria-hidden="true" />
        <div>
          <p className="font-semibold">{title ?? access.alertTitle}</p>
          <p className="mt-1 text-text-secondary">{text}</p>
        </div>
      </div>
      <PlanRequiredCTA label={access.ctaLabel} />
    </div>
  );
}

export function ReadOnlyModeBanner() {
  const access = useAccessState();
  if (!access.shouldWarn || !access.banner) return null;
  return <BillingRequiredAlert title={access.label} message={access.banner} className="mb-6" />;
}

export function AccessStateBadge({ state }: { state?: OrgAccessState }) {
  const access = useAccessState();
  const view = state ? getAccessStateView(state) : access;
  const active = view.state === "paid_active" || view.state === "trialing" || view.state === "developer_unlimited";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        active ? "bg-accent-green-soft text-accent-green" : "bg-accent-yellow-soft text-accent-yellow",
      )}
    >
      {!active && <LockIcon size={12} aria-hidden="true" />}
      {view.label}
    </span>
  );
}
