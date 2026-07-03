import { z } from "zod";

export const pushPayloadSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().max(240),
  tag: z.string().min(1).max(200),
  url: z.string().startsWith("/dashboard/").refine((value) => !value.startsWith("//")),
  notificationId: z.string().uuid(),
});

export type PushPayload = z.infer<typeof pushPayloadSchema>;

export function createPushPayload(input: PushPayload): PushPayload {
  return pushPayloadSchema.parse(input);
}
