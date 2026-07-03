"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { ROUTES } from "@/shared/config/routes";
import {
  createDeveloperApiKey,
  revokeDeveloperApiKey,
} from "../services/api-key-service";
import {
  createDeveloperWebhook,
  disableDeveloperWebhook,
} from "../services/webhook-service";

export interface DeveloperActionState {
  success?: string;
  error?: string;
  rawKey?: string;
  rawSecret?: string;
}

function requireDeveloperManagePermission(ctx: Awaited<ReturnType<typeof requireOrg>>) {
  return canDo(ctx, "developer.manage") || ["owner", "admin"].includes(ctx.membership.roleId);
}

function formValues(formData: FormData, key: string): string[] {
  return formData.getAll(key).map(String).filter(Boolean);
}

export async function createDeveloperApiKeyAction(
  _prevState: DeveloperActionState,
  formData: FormData,
): Promise<DeveloperActionState> {
  const ctx = await requireOrg();
  if (!requireDeveloperManagePermission(ctx)) return { error: "You do not have permission to manage developer access." };

  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2 || name.length > 120) {
    return { error: "API key name must be between 2 and 120 characters." };
  }

  const scopes = formValues(formData, "scopes");
  if (scopes.length === 0) return { error: "Choose at least one API scope." };

  try {
    const created = await createDeveloperApiKey({
      organizationId: ctx.org.id,
      name,
      scopes,
      createdBy: ctx.user.id,
      environment: "live",
    });
    revalidatePath(ROUTES.settingsDeveloper);
    return {
      success: "API key created. Copy it now; it will not be shown again.",
      rawKey: created.rawKey,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to create API key." };
  }
}

export async function revokeDeveloperApiKeyAction(
  _prevState: DeveloperActionState,
  formData: FormData,
): Promise<DeveloperActionState> {
  const ctx = await requireOrg();
  if (!requireDeveloperManagePermission(ctx)) return { error: "You do not have permission to manage developer access." };

  const apiKeyId = String(formData.get("apiKeyId") ?? "");
  if (!apiKeyId) return { error: "Missing API key id." };

  try {
    await revokeDeveloperApiKey({ organizationId: ctx.org.id, apiKeyId });
    revalidatePath(ROUTES.settingsDeveloper);
    return { success: "API key revoked." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to revoke API key." };
  }
}

export async function createDeveloperWebhookAction(
  _prevState: DeveloperActionState,
  formData: FormData,
): Promise<DeveloperActionState> {
  const ctx = await requireOrg();
  if (!requireDeveloperManagePermission(ctx)) return { error: "You do not have permission to manage developer access." };

  const url = String(formData.get("url") ?? "").trim();
  const events = formValues(formData, "events");
  if (!url.startsWith("https://")) return { error: "Webhook URL must start with https://." };
  if (events.length === 0) return { error: "Choose at least one webhook event." };

  try {
    const created = await createDeveloperWebhook({
      organizationId: ctx.org.id,
      url,
      events,
      createdBy: ctx.user.id,
    });
    revalidatePath(ROUTES.settingsDeveloper);
    return {
      success: "Webhook created. Copy the signing secret now; it will not be shown again.",
      rawSecret: created.rawSecret,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to create webhook." };
  }
}

export async function disableDeveloperWebhookAction(
  _prevState: DeveloperActionState,
  formData: FormData,
): Promise<DeveloperActionState> {
  const ctx = await requireOrg();
  if (!requireDeveloperManagePermission(ctx)) return { error: "You do not have permission to manage developer access." };

  const webhookId = String(formData.get("webhookId") ?? "");
  if (!webhookId) return { error: "Missing webhook id." };

  try {
    await disableDeveloperWebhook({ organizationId: ctx.org.id, webhookId });
    revalidatePath(ROUTES.settingsDeveloper);
    return { success: "Webhook disabled." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to disable webhook." };
  }
}
