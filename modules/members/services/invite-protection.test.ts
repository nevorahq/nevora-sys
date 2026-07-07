import { describe, expect, it, vi } from "vitest";
import {
  assertInviteSeatAvailable,
  canAcceptInvite,
  checkInviteRecipientEligibility,
  checkInviteSenderEligibility,
  inviteReasonFromMessage,
  inviteRecipientMessage,
  inviteSenderMessage,
  normalizeInviteRole,
} from "./invite-protection";

describe("normalizeInviteRole", () => {
  it.each([
    ["member", "member"],
    [" MEMBER ", "member"],
    ["admin", "admin"],
    [null, "member"],
  ] as const)("normalizes %s to %s", (input, expected) => {
    expect(normalizeInviteRole(input)).toBe(expected);
  });

  it.each(["owner", "billing_admin", "manager", ""])("rejects %s", (role) => {
    expect(normalizeInviteRole(role)).toBeNull();
  });
});

describe("assertInviteSeatAvailable", () => {
  it("allows below the limit", () => {
    expect(assertInviteSeatAvailable({ limit: 3, occupiedSeats: 2 })).toEqual({
      allowed: true,
      reason: "allowed",
    });
  });

  it("blocks a new invite when the limit is reached", () => {
    expect(assertInviteSeatAvailable({ limit: 3, occupiedSeats: 3 })).toEqual({
      allowed: false,
      reason: "member_limit_reached",
    });
  });

  it("allows accepting an already reserved direct invite at the limit", () => {
    expect(assertInviteSeatAvailable({ limit: 3, occupiedSeats: 3, reservedSeat: true })).toEqual({
      allowed: true,
      reason: "allowed",
    });
  });

  it("blocks accepting a reserved invite after a downgrade below occupancy", () => {
    expect(assertInviteSeatAvailable({ limit: 2, occupiedSeats: 3, reservedSeat: true })).toEqual({
      allowed: false,
      reason: "member_limit_reached",
    });
  });
});

describe("invite policy decisions", () => {
  it("allows owner/admin send in a trialing org while seats are available", () => {
    expect(
      checkInviteSenderEligibility({
        organizationAccessState: "trialing",
        hasPermission: true,
        role: "member",
        limit: 3,
        occupiedSeats: 2,
      }),
    ).toEqual({ allowed: true, reason: "allowed" });
  });

  it("blocks send in restricted organizations", () => {
    expect(
      checkInviteSenderEligibility({
        organizationAccessState: "trial_expired",
        hasPermission: true,
        role: "member",
        limit: 3,
        occupiedSeats: 1,
      }),
    ).toEqual({ allowed: false, reason: "trial_expired" });
  });

  it.each([
    "requires_paid_plan",
    "payment_past_due",
    "payment_grace",
    "payment_unpaid",
    "canceled",
    "suspended",
    "security_hold",
  ] as const)("blocks invite send in %s", (organizationAccessState) => {
    expect(
      checkInviteSenderEligibility({
        organizationAccessState,
        hasPermission: true,
        role: "member",
        limit: 10,
        occupiedSeats: 1,
      }),
    ).toMatchObject({ allowed: false });
  });

  it("allows a trial-used recipient into paid_active as member", () => {
    expect(
      canAcceptInvite({
        organizationAccessState: "paid_active",
        recipientTrialUsed: true,
        role: "member",
        limit: 10,
        occupiedSeats: 2,
      }),
    ).toEqual({ allowed: true, reason: "allowed" });
  });

  it("blocks a trial-used recipient from trialing organizations", () => {
    expect(
      checkInviteRecipientEligibility({
        organizationAccessState: "trialing",
        recipientTrialUsed: true,
        role: "member",
        limit: 3,
        occupiedSeats: 1,
      }),
    ).toEqual({ allowed: false, reason: "trial_already_used" });
  });

  it("blocks a trial-used recipient from accepting elevated roles", () => {
    expect(
      canAcceptInvite({
        organizationAccessState: "paid_active",
        recipientTrialUsed: true,
        role: "admin",
        limit: 10,
        occupiedSeats: 2,
      }),
    ).toEqual({ allowed: false, reason: "billing_owner_restricted" });
  });

  it("models last-seat invite acceptance race as one reserved success and one denial", () => {
    const first = canAcceptInvite({
      organizationAccessState: "paid_active",
      recipientTrialUsed: false,
      role: "member",
      limit: 3,
      occupiedSeats: 3,
      reservedSeat: true,
    });
    const second = canAcceptInvite({
      organizationAccessState: "paid_active",
      recipientTrialUsed: false,
      role: "member",
      limit: 3,
      occupiedSeats: 4,
      reservedSeat: true,
    });

    expect(first).toEqual({ allowed: true, reason: "allowed" });
    expect(second).toEqual({ allowed: false, reason: "member_limit_reached" });
  });
});

describe("message and RPC reason mapping", () => {
  it.each([
    ["member_limit_reached", "member_limit_reached"],
    ["ERROR: trial_already_used", "trial_already_used"],
    ["invite_invalid", "invite_not_found"],
    ["not_authorized", "permission_denied"],
  ] as const)("maps %s", (message, expected) => {
    expect(inviteReasonFromMessage(message)).toBe(expected);
  });

  it("uses required sender messages", () => {
    expect(inviteSenderMessage("member_limit_reached")).toBe("Достигнут лимит участников для текущего плана.");
    expect(inviteSenderMessage("trial_expired")).toBe(
      "Приглашения временно недоступны для текущего плана. Перейдите в Billing, чтобы продолжить.",
    );
  });

  it("keeps recipient reasons generic", () => {
    expect(inviteRecipientMessage("recipient_mismatch")).toBe(
      "Это приглашение сейчас недоступно. Организация должна активировать платный план или обновить доступ.",
    );
  });

  it("does not throw when audit logging is unavailable", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { auditInviteDecision } = await import("./invite-protection");

    expect(() => auditInviteDecision({
      action: "accept",
      reason: "trial_already_used",
      organizationId: "org",
      actorId: "user",
      targetUserId: "user",
    })).not.toThrow();

    spy.mockRestore();
  });
});
