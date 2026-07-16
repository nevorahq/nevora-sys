import { evaluateEntitlement, type AccessIntent } from "@/lib/security/entitlements";
import type { OrgAccessState } from "../types/entitlement.types";

export type AccessGateIntent = Extract<AccessIntent, "write" | "invite" | "execute" | "billing" | "admin">;

/**
 * Localizable copy for the access/plan-gate surface. The UI builds this from
 * `dict.access` and threads it through `AccessStateProvider`; server/no-arg
 * callers fall back to `defaultAccessCopy` (byte-identical to the pre-i18n
 * strings, so `access-state-ui.test.ts` and gating logic stay unchanged).
 */
export interface AccessCopy {
  states: Record<OrgAccessState, string>;
  restricted: Partial<Record<OrgAccessState, string>>;
  blockedDefault: string;
  blockedInvite: string;
  blockedExecute: string;
  blockedUpload: string;
  alertTitle: string;
  ctaLabel: string;
}

export interface AccessStateView {
  state: OrgAccessState;
  label: string;
  canWrite: boolean;
  canInvite: boolean;
  canExecute: boolean;
  isReadOnly: boolean;
  shouldWarn: boolean;
  banner: string | null;
  reason: string;
  /** Localized intent messages carried on the view so client components render in-locale. */
  blocked: { default: string; invite: string; execute: string; upload: string };
  alertTitle: string;
  ctaLabel: string;
}

const ACCESS_STATE_LABELS: Record<OrgAccessState, string> = {
  no_org: "No organization",
  trialing: "Trial active",
  trial_expired: "Trial expired",
  requires_paid_plan: "Paid plan required",
  paid_active: "Paid active",
  payment_past_due: "Payment past due",
  payment_grace: "Payment grace",
  payment_unpaid: "Payment unpaid",
  canceled: "Canceled",
  suspended: "Suspended",
  security_hold: "Security hold",
  developer_unlimited: "Developer unlimited",
};

const RESTRICTED_COPY: Partial<Record<OrgAccessState, string>> = {
  trial_expired: "Пробный период завершён. Данные сохранены, но новые действия временно недоступны. Выберите платный план, чтобы продолжить.",
  requires_paid_plan: "Для продолжения работы выберите платный план.",
  canceled: "Для продолжения работы выберите платный план.",
  payment_unpaid: "Оплата требуется для продолжения работы. Обновите биллинг, чтобы восстановить доступ.",
  payment_past_due: "Платёж просрочен. Обновите биллинг, чтобы сохранить доступ к действиям.",
  payment_grace: "Платёж просрочен. Обновите биллинг, чтобы сохранить доступ к действиям.",
  suspended: "Организация приостановлена. Обратитесь в поддержку, чтобы восстановить доступ.",
  security_hold: "Организация на проверке безопасности. Обратитесь в поддержку, чтобы продолжить.",
  no_org: "Выберите организацию, чтобы продолжить.",
};

export const DEFAULT_BLOCKED_ACTION_MESSAGE = "Действие недоступно для текущего состояния плана.";
export const INVITE_BLOCKED_MESSAGE = "Приглашения недоступны после завершения пробного периода.";
export const AI_BLOCKED_MESSAGE = "AI-действия недоступны для текущего плана.";
export const UPLOAD_BLOCKED_MESSAGE = "Загрузка документов доступна после активации плана.";

/**
 * Legacy default copy — byte-identical to the pre-i18n strings so no-arg callers
 * (tests, server gating) are unchanged. The UI passes localized copy from `dict.access`.
 */
export const defaultAccessCopy: AccessCopy = {
  states: ACCESS_STATE_LABELS,
  restricted: RESTRICTED_COPY,
  blockedDefault: DEFAULT_BLOCKED_ACTION_MESSAGE,
  blockedInvite: INVITE_BLOCKED_MESSAGE,
  blockedExecute: AI_BLOCKED_MESSAGE,
  blockedUpload: UPLOAD_BLOCKED_MESSAGE,
  alertTitle: "Доступ ограничен",
  ctaLabel: "Перейти к оплате",
};

export function getAccessStateView(
  state: OrgAccessState,
  copy: AccessCopy = defaultAccessCopy,
): AccessStateView {
  const canWrite = evaluateEntitlement(state, "write").allowed;
  const canInvite = evaluateEntitlement(state, "invite").allowed;
  const canExecute = evaluateEntitlement(state, "execute").allowed;
  const banner = copy.restricted[state] ?? null;

  return {
    state,
    label: copy.states[state],
    canWrite,
    canInvite,
    canExecute,
    isReadOnly: !canWrite,
    shouldWarn: state !== "developer_unlimited" && Boolean(banner),
    banner,
    reason: banner ?? copy.blockedDefault,
    blocked: {
      default: copy.blockedDefault,
      invite: copy.blockedInvite,
      execute: copy.blockedExecute,
      upload: copy.blockedUpload,
    },
    alertTitle: copy.alertTitle,
    ctaLabel: copy.ctaLabel,
  };
}

export function isAccessIntentAllowed(state: OrgAccessState, intent: AccessGateIntent): boolean {
  return evaluateEntitlement(state, intent).allowed;
}

export function blockedActionMessage(
  intent: AccessGateIntent,
  state: OrgAccessState,
  copy: AccessCopy = defaultAccessCopy,
): string {
  if (intent === "invite") return copy.blockedInvite;
  if (intent === "execute") return copy.blockedExecute;
  const view = getAccessStateView(state, copy);
  return view.banner ?? copy.blockedDefault;
}
