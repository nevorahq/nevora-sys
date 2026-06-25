import { z } from "zod";

export const createHostSchema = z.object({
  display_name: z.string().min(1, "Name is required").max(100),
  host_slug: z
    .string()
    .min(1, "Slug is required")
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers and hyphens"),
  public_title: z.string().max(100).optional(),
  timezone: z.string().min(1, "Timezone is required"),
});

export type CreateHostInput = z.infer<typeof createHostSchema>;

export const updateHostSchema = z.object({
  id: z.string().uuid(),
  display_name: z.string().min(1, "Name is required").max(100),
  host_slug: z
    .string()
    .min(1, "Slug is required")
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers and hyphens"),
  public_title: z.string().max(100).optional(),
  timezone: z.string().min(1, "Timezone is required"),
});

export type UpdateHostInput = z.infer<typeof updateHostSchema>;
