"use server";

import { createClient } from "@/lib/supabase/server";
import type { EmitAuditLogParams } from "./audit-log.types";

/**
 * Записывает audit log запись в БД.
 *
 * Вызывается для критичных мутаций: create, update, delete,
 * role_change, billing_change, invite, suspend.
 *
 * Так же как emitDomainEvent — ошибка записи НЕ откатывает
 * основную операцию. Логируем, не бросаем.
 *
 * Пример:
 *
 *   await emitAuditLog({
 *     organizationId: ctx.org.id,
 *     entityType: "todos",
 *     entityId: todo.id,
 *     action: "delete",
 *     oldData: { title: todo.title, priority: todo.priority },
 *   });
 */
export async function emitAuditLog(params: EmitAuditLogParams): Promise<void> {
  try {
    const supabase = await createClient();

    const { error } = await supabase.rpc("emit_audit_log", {
      p_organization_id: params.organizationId,
      p_entity_type: params.entityType,
      p_entity_id: params.entityId,
      p_action: params.action,
      p_old_data: params.oldData ?? null,
      p_new_data: params.newData ?? null,
      p_metadata: params.metadata ?? {},
    });

    if (error) {
      console.error("[emitAuditLog] failed:", {
        entity: params.entityType,
        entityId: params.entityId,
        action: params.action,
        error: error.message,
      });
    }
  } catch (err) {
    console.error("[emitAuditLog] unexpected error:", err);
  }
}
