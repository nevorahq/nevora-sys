import { evaluateEntitlement, type AccessIntent } from "@/lib/security/entitlements";
import type { OrgAccessState } from "../types/entitlement.types";

export type AccessGateIntent = Extract<AccessIntent, "write" | "invite" | "execute" | "billing" | "admin">;

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

export function getAccessStateView(state: OrgAccessState): AccessStateView {
  const canWrite = evaluateEntitlement(state, "write").allowed;
  const canInvite = evaluateEntitlement(state, "invite").allowed;
  const canExecute = evaluateEntitlement(state, "execute").allowed;
  const banner = RESTRICTED_COPY[state] ?? null;

  return {
    state,
    label: ACCESS_STATE_LABELS[state],
    canWrite,
    canInvite,
    canExecute,
    isReadOnly: !canWrite,
    shouldWarn: state !== "developer_unlimited" && Boolean(banner),
    banner,
    reason: banner ?? DEFAULT_BLOCKED_ACTION_MESSAGE,
  };
}

export function isAccessIntentAllowed(state: OrgAccessState, intent: AccessGateIntent): boolean {
  return evaluateEntitlement(state, intent).allowed;
}

export function blockedActionMessage(intent: AccessGateIntent, state: OrgAccessState): string {
  if (intent === "invite") return INVITE_BLOCKED_MESSAGE;
  if (intent === "execute") return AI_BLOCKED_MESSAGE;
  const view = getAccessStateView(state);
  if (state === "requires_paid_plan") return "Для продолжения работы выберите платный план.";
  return view.banner ?? DEFAULT_BLOCKED_ACTION_MESSAGE;
}
