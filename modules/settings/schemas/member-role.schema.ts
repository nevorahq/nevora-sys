import { z } from "zod";

export const memberRoleSchema = z.object({
  memberId: z.string().uuid("Invalid member"),
  role: z.enum(["admin", "member"]),
});

export const removeMemberSchema = z.object({
  memberId: z.string().uuid("Invalid member"),
});
