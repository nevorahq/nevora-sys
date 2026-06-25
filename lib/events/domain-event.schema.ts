import { z } from "zod";
import { uuidSchema } from "@/lib/validators/common";
import { DOMAIN_EVENT_NAMES } from "./domain-event-names";

const payloadSchema = z.record(z.string(), z.unknown()).default({}).refine(
  (payload) => JSON.stringify(payload).length <= 16_000,
  "Payload is too large",
);

export const publishDomainEventSchema = z.object({
  organizationId: uuidSchema,
  workspaceId: uuidSchema.nullish(),
  eventName: z.enum(DOMAIN_EVENT_NAMES),
  aggregateType: z.string().trim().min(1).max(64),
  aggregateId: uuidSchema,
  payload: payloadSchema,
});

export type PublishDomainEventParsed = z.infer<typeof publishDomainEventSchema>;
