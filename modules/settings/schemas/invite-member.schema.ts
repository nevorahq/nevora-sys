import { z } from "zod";

export const inviteMemberSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  role: z.enum(["admin", "member"]).default("member"),
});

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
