import "server-only";

import type { OrgAccessState } from "@/modules/billing/types/entitlement.types";

export const INVITE_REASONS = [
  "invite_not_found",
  "invite_expired",
  "invite_already_used",
  "auth_required",
  "recipient_mismatch",
  "organization_restricted",
  "trial_expired",
  "trial_already_used",
  "paid_plan_required",
  "member_limit_reached",
  "role_not_allowed",
  "permission_denied",
  "billing_owner_restricted",
  "allowed",
] as const;

export type InviteDecisionReason = (typeof INVITE_REASONS)[number];
export type InviteRole = "member" | "admin";

export interface InviteDecision {
  allowed: boolean;
  reason: InviteDecisionReason;
}

export interface SeatAvailabilityInput {
  limit: number | null;
  occupiedSeats: number;
  reservedSeat?: boolean;
}

export interface RecipientEligibilityInput extends SeatAvailabilityInput {
  organizationAccessState: OrgAccessState;
  recipientTrialUsed: boolean;
  role: string | null | undefined;
}

const SENDER_ALLOWED_STATES = new Set<OrgAccessState>([
  "trialing",
  "paid_active",
  "developer_unlimited",
]);

const RECIPIENT_ALLOWED_STATES = SENDER_ALLOWED_STATES;

const RESTRICTED_MESSAGES = new Set<InviteDecisionReason>([
  "organization_restricted",
  "trial_expired",
  "paid_plan_required",
]);

const MEMBER_LIMIT_MESSAGE = "Достигнут лимит участников для текущего плана.";
const INVITES_BLOCKED_MESSAGE =
  "Приглашения временно недоступны для текущего плана. Перейдите в Billing, чтобы продолжить.";
const RECIPIENT_BLOCKED_MESSAGE =
  "Это приглашение сейчас недоступно. Организация должна активировать платный план или обновить доступ.";

export function normalizeInviteRole(role: string | null | undefined): InviteRole | null {
  const normalized = (role ?? "member").trim().toLowerCase();
  return normalized === "member" || normalized === "admin" ? normalized : null;
}

export function assertInviteSeatAvailable(input: SeatAvailabilityInput): InviteDecision {
  if (input.limit == null || input.limit === -1) return { allowed: true, reason: "allowed" };

  const blocked = input.reservedSeat
    ? input.occupiedSeats > input.limit
    : input.occupiedSeats >= input.limit;

  return blocked
    ? { allowed: false, reason: "member_limit_reached" }
    : { allowed: true, reason: "allowed" };
}

export function checkInviteSenderEligibility(input: {
  organizationAccessState: OrgAccessState;
  role: string | null | undefined;
  hasPermission: boolean;
} & SeatAvailabilityInput): InviteDecision {
  if (!input.hasPermission) return { allowed: false, reason: "permission_denied" };
  if (!normalizeInviteRole(input.role)) return { allowed: false, reason: "role_not_allowed" };

  if (!SENDER_ALLOWED_STATES.has(input.organizationAccessState)) {
    return {
      allowed: false,
      reason: input.organizationAccessState === "trial_expired"
        ? "trial_expired"
        : "organization_restricted",
    };
  }

  return assertInviteSeatAvailable(input);
}

export function checkInviteRecipientEligibility(input: RecipientEligibilityInput): InviteDecision {
  const role = normalizeInviteRole(input.role);
  if (!role) return { allowed: false, reason: "role_not_allowed" };

  if (!RECIPIENT_ALLOWED_STATES.has(input.organizationAccessState)) {
    if (input.organizationAccessState === "trial_expired") {
      return { allowed: false, reason: "trial_expired" };
    }
    return { allowed: false, reason: "organization_restricted" };
  }

  if (input.recipientTrialUsed) {
    if (role !== "member") {
      return { allowed: false, reason: "billing_owner_restricted" };
    }
    if (input.organizationAccessState !== "paid_active"
      && input.organizationAccessState !== "developer_unlimited") {
      return { allowed: false, reason: "trial_already_used" };
    }
  }

  return assertInviteSeatAvailable(input);
}

export function canAcceptInvite(input: RecipientEligibilityInput): InviteDecision {
  return checkInviteRecipientEligibility(input);
}

export function inviteReasonFromMessage(message: string | null | undefined): InviteDecisionReason {
  const raw = message ?? "";
  const found = INVITE_REASONS.find((reason) => raw.includes(reason));
  if (found) return found;
  if (raw.includes("not_authenticated")) return "auth_required";
  if (raw.includes("not_authorized")) return "permission_denied";
  if (raw.includes("invalid_role")) return "role_not_allowed";
  if (raw.includes("invite_invalid")) return "invite_not_found";
  return "organization_restricted";
}

export function inviteSenderMessage(reason: InviteDecisionReason): string {
  if (reason === "member_limit_reached") return MEMBER_LIMIT_MESSAGE;
  if (RESTRICTED_MESSAGES.has(reason)) return INVITES_BLOCKED_MESSAGE;
  if (reason === "role_not_allowed" || reason === "billing_owner_restricted") {
    return "Эта роль недоступна для приглашения.";
  }
  if (reason === "permission_denied") return "Only owners and admins can invite members";
  return INVITES_BLOCKED_MESSAGE;
}

export function inviteRecipientMessage(_reason: InviteDecisionReason): string {
  return RECIPIENT_BLOCKED_MESSAGE;
}

export function auditInviteDecision(input: {
  action: "send" | "accept";
  reason: InviteDecisionReason;
  organizationId?: string | null;
  actorId?: string | null;
  targetUserId?: string | null;
  role?: string | null;
}): void {
  try {
    if (input.reason === "allowed") return;
    console.warn("[invite-decision]", {
      action: input.action,
      reason: input.reason,
      organizationId: input.organizationId ?? null,
      actorId: input.actorId ?? null,
      targetUserId: input.targetUserId ?? null,
      role: input.role ?? null,
    });
  } catch {
    // Audit must never break the invite flow.
  }
}

