import { z } from "zod";

/** Схема для публичного API создания booking request. */
export const createBookingRequestSchema = z.object({
  organizationSlug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Invalid slug format"),
  hostSlug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Invalid slug format"),
  serviceSlug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Invalid slug format"),
  start: z
    .string()
    .datetime({ offset: true, message: "start must be ISO 8601 with timezone offset" }),
  clientTimezone: z.string().min(1).max(100).optional(),
  client: z.object({
    name: z.string().min(1, "Name is required").max(200).trim(),
    email: z.string().email().max(300).trim().optional().or(z.literal("")),
    phone: z
      .string()
      .max(50)
      .trim()
      .regex(/^\+?[\d\s\-().]{6,}$/, "Invalid phone format")
      .optional()
      .or(z.literal("")),
    message: z.string().max(2000).trim().optional(),
  }),
  honeypot: z.string().max(0, "Bot detected").optional(),
});

export type CreateBookingRequestInput = z.infer<typeof createBookingRequestSchema>;

/** Схема для изменения статуса booking request (internal). */
export const updateBookingRequestStatusSchema = z.object({
  status: z.enum(["accepted", "rejected", "canceled"]),
});

export type UpdateBookingRequestStatusInput = z.infer<
  typeof updateBookingRequestStatusSchema
>;
