import { z } from "zod";

export const profileSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required").max(100),
  phone: z.string().trim().max(40).default(""),
  language: z.enum(["en", "ru"]),
  timezone: z.string().trim().min(1).max(100),
});

export type ProfileInput = z.infer<typeof profileSchema>;
