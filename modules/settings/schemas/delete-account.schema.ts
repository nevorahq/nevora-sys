import { z } from "zod";

/**
 * Confirmation payload for requesting account deletion. Two factors:
 *   - `confirmation` must equal the account email (verified in the action) — a
 *     deliberate, un-guessable phrase that also works for OAuth-only users;
 *   - `password` re-authenticates the session for users who have an email/
 *     password identity. It is optional at the schema level because OAuth-only
 *     accounts have no password; the action decides whether it is required.
 */
export const requestAccountDeletionSchema = z.object({
  confirmation: z.string().trim().min(1, "Type your email to confirm."),
  password: z.string().max(200).optional().default(""),
  reason: z.string().trim().max(500).optional().default(""),
});

export type RequestAccountDeletionInput = z.infer<
  typeof requestAccountDeletionSchema
>;
