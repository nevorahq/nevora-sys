"use server";

import { requireOrg } from "@/lib/auth/require-org";
import type { ActionResult } from "@/lib/validators/common";

/**
 * DEPRECATED / no-op.
 *
 * Подписка провижинится атомарно внутри create_organization() (14-дневный
 * trial) при создании организации. Раньше этот action вызывал
 * init_free_subscription() напрямую под сессией пользователя — это был канал
 * самостоятельной выдачи безлимитного free-forever плана в обход trial.
 *
 * Provisioning-функции теперь internal-only (см. migration 035), поэтому
 * здесь не выполняется никаких привилегированных операций. Action сохранён
 * только ради обратной совместимости сигнатуры экспорта.
 */
export async function initSubscriptionAction(
  _prevState: ActionResult,
  _formData: FormData,
): Promise<ActionResult> {
  // Требуем валидный контекст, но НЕ выдаём план.
  await requireOrg();
  return {};
}
