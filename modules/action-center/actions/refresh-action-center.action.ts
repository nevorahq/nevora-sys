"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { ROUTES } from "@/shared/config/routes";
import { syncActionItems } from "../services/action-item-generator";
import type { ActionResult } from "../types/action-item.types";

/**
 * Перегенерировать action items из текущего состояния модулей и обновить экран.
 * Идемпотентно (см. syncActionItems). Требует action_center.view.
 */
export async function refreshActionCenter(): Promise<ActionResult<{ created: number }>> {
  const ctx = await requireOrg();
  if (!canDo(ctx, "action_center.view")) return { ok: false, error: "Forbidden" };

  const supabase = await createClient();
  const { created } = await syncActionItems(supabase, ctx);

  revalidatePath(ROUTES.actions);
  return { ok: true, data: { created } };
}
