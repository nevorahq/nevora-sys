import { z } from "zod";

export const createServiceSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers and hyphens"),
  description: z.string().max(500).optional(),
  duration_minutes: z.coerce
    .number()
    .int()
    .min(5, "Minimum 5 minutes")
    .max(480, "Maximum 8 hours"),
  booking_window_days: z.coerce
    .number()
    .int()
    .min(1)
    .max(365)
    .default(30),
});

export type CreateServiceInput = z.infer<typeof createServiceSchema>;

export const updateServiceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, "Name is required").max(100),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers and hyphens"),
  description: z.string().max(500).optional(),
  duration_minutes: z.coerce.number().int().min(5).max(480),
  booking_window_days: z.coerce.number().int().min(1).max(365),
});

export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;
