"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";
import { setSelectedOrganizationId } from "@/lib/auth/organization-cookie";
import { switchOrganizationSchema } from "../schemas/member.schemas";
import { ROUTES } from "@/shared/config/routes";

export type SwitchOrganizationResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Переключить активную организацию пользователя.
 *
 * Security: organization_id из клиента — только "запрос", не источник
 * истины. Прежде чем сохранить его в cookie, проверяем, что у текущего
 * аутентифицированного пользователя есть ACTIVE membership в этой
 * организации (invited/suspended/чужая org — отклонено). RLS
 * (memberships_select_own) не даёт увидеть чужие строки, но проверка ниже
 * не полагается на это — явная eq по user_id + organization_id + status.
 */
export async function switchOrganizationAction(
  input: { organizationId: string },
): Promise<SwitchOrganizationResult> {
  const parsed = switchOrganizationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid organization" };
  }

  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("memberships")
    .select("id")
    .eq("user_id", user.id)
    .eq("organization_id", parsed.data.organizationId)
    .eq("status", "active")
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: "You do not have access to that organization" };
  }

  await setSelectedOrganizationId(parsed.data.organizationId);
  revalidatePath(ROUTES.dashboard, "layout");

  return { ok: true };
}
