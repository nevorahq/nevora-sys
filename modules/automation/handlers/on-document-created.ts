import { createEntityLink } from "@/lib/entity-links";
import type { AutomationHandler } from "../engine/automation-handler.types";

/**
 * document.created → автоматическая связь документа с породившей сущностью.
 *
 * Если документ создан «из» другой сущности (payload несёт linked_entity_*),
 * движок создаёт entity_link document --generated_from--> <entity>.
 * Иначе — skipped (нечего связывать). Это рабочая демонстрация прохождения
 * полного конвейера event → automation → entity_link → audit log.
 */
export const onDocumentCreated: AutomationHandler = {
  name: "on-document-created",
  eventName: "document.created",
  async run(ctx) {
    if (ctx.payload.source === "subscription" || ctx.payload.skip_money_sync === true) {
      return {
        status: "skipped",
        output: { reason: "subscription attachment must not trigger document automations" },
      };
    }

    const linkedType = ctx.payload.linked_entity_type;
    const linkedId = ctx.payload.linked_entity_id;

    if (typeof linkedType !== "string" || typeof linkedId !== "string") {
      return {
        status: "skipped",
        output: { reason: "no linked_entity in payload" },
      };
    }

    const res = await createEntityLink({
      sourceType: "document",
      sourceId: ctx.aggregateId,
      targetType: linkedType,
      targetId: linkedId,
      linkType: "generated_from",
      metadata: { source: "auto", matched_by: ["linked_entity_id"] },
    });

    if (!res.ok) {
      return { status: "failed", errorMessage: res.error };
    }

    return { status: "executed", output: { entityLinkId: res.data.id } };
  },
};
