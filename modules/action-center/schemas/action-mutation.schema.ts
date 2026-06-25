import { z } from "zod";
import { uuidSchema } from "@/lib/validators/common";

/** Мутации Action Center. Все принимают actionItemId; org резолвится сервером. */

export const resolveActionItemSchema = z.object({
  actionItemId: uuidSchema,
  note: z.string().trim().max(1_000).optional(),
});

export const dismissActionItemSchema = z.object({
  actionItemId: uuidSchema,
  reason: z.string().trim().max(1_000).optional(),
});

export const snoozeActionItemSchema = z.object({
  actionItemId: uuidSchema,
  snoozedUntil: z
    .string()
    .datetime("Invalid snooze date")
    .refine((d) => new Date(d).getTime() > Date.now(), "Snooze date must be in the future"),
});

export const assignActionItemSchema = z.object({
  actionItemId: uuidSchema,
  // null → снять назначение; "me" обрабатывается в action-слое (подставляет own id)
  assigneeId: uuidSchema.nullable(),
});

export const executeActionItemSchema = z.object({
  actionItemId: uuidSchema,
  executeKind: z.string().trim().min(1).max(64),
  // dangerous actions требуют явного confirmed=true
  confirmed: z.boolean().default(false),
});

export type ResolveActionItemParsed = z.infer<typeof resolveActionItemSchema>;
export type DismissActionItemParsed = z.infer<typeof dismissActionItemSchema>;
export type SnoozeActionItemParsed = z.infer<typeof snoozeActionItemSchema>;
export type AssignActionItemParsed = z.infer<typeof assignActionItemSchema>;
export type ExecuteActionItemParsed = z.infer<typeof executeActionItemSchema>;
