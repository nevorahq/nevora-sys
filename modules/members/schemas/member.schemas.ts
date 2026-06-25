import { z } from "zod";

export const MEMBER_ROLES = ["member", "admin"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const inviteMemberSchema = z.object({
  email: z.string().trim().email(),
  role:  z.enum(MEMBER_ROLES).default("member"),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const inviteResponseSchema = z.object({
  organizationId: z.string().uuid(),
});
export type InviteResponseInput = z.infer<typeof inviteResponseSchema>;

// ── Invite links (token-based) ──────────────────────────────────────────
export const createInviteLinkSchema = z.object({
  role: z.enum(MEMBER_ROLES).default("member"),
});
export type CreateInviteLinkInput = z.infer<typeof createInviteLinkSchema>;

export const acceptInviteLinkSchema = z.object({
  token: z.string().min(10),
});
export type AcceptInviteLinkInput = z.infer<typeof acceptInviteLinkSchema>;
