import { z } from "zod";
import { RENEWAL_DECISION_ACTIONS } from "@nevora/subscriptions-contracts";

export const renewalDecisionSchema = z.object({
  renewalCaseId: z.string().uuid(),
  action: z.enum(RENEWAL_DECISION_ACTIONS),
  note: z.string().trim().max(2000).nullable().default(null),
  snoozedUntil: z.string().datetime({ offset: true }).nullable().default(null),
  createCancellationTask: z.boolean().default(true),
  expectedUpdatedAt: z.string().min(1),
}).superRefine((data, ctx) => {
  if (data.action === "snooze" && !data.snoozedUntil) {
    ctx.addIssue({ code: "custom", path: ["snoozedUntil"], message: "Choose when to be reminded." });
  }
});

export type RenewalDecisionInput = z.infer<typeof renewalDecisionSchema>;
