"use client";

import { useActionState } from "react";
import { KeyRoundIcon, LockIcon, PlugZapIcon, RotateCcwIcon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  createDeveloperApiKeyAction,
  createDeveloperWebhookAction,
  disableDeveloperWebhookAction,
  revokeDeveloperApiKeyAction,
} from "../actions/developer-access.actions";
import {
  DEVELOPER_API_KEY_SCOPES,
  DEVELOPER_WEBHOOK_EVENTS,
  type DeveloperApiKey,
  type DeveloperWebhook,
} from "../types/developer.types";

interface DeveloperSettingsProps {
  overview: {
    canManage: boolean;
    entitlements: {
      developerAccess: boolean;
      publicApi: boolean;
      developerWebhooks: boolean;
    };
    usage: {
      apiKeys: { used: number; limit: number | null };
      webhooks: { used: number; limit: number | null };
      apiRequestsMonthly: { used: number; limit: number | null };
    };
    apiKeys: DeveloperApiKey[];
    webhooks: DeveloperWebhook[];
  };
}

function limitLabel(used: number, limit: number | null) {
  return `${used} / ${limit === null ? "unlimited" : limit}`;
}

function OptionCheckbox({ id, name, value }: { id: string; name: string; value: string }) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 rounded-(--neu-radius-md) bg-surface-sunken px-3 py-2 text-sm text-text-secondary">
      <input id={id} name={name} value={value} type="checkbox" className="h-4 w-4 accent-current" />
      <span>{value}</span>
    </label>
  );
}

export function DeveloperSettings({ overview }: DeveloperSettingsProps) {
  const [createKeyState, createKeyAction, creatingKey] = useActionState(createDeveloperApiKeyAction, {});
  const [revokeKeyState, revokeKeyAction, revokingKey] = useActionState(revokeDeveloperApiKeyAction, {});
  const [createWebhookState, createWebhookAction, creatingWebhook] = useActionState(createDeveloperWebhookAction, {});
  const [disableWebhookState, disableWebhookAction, disablingWebhook] = useActionState(disableDeveloperWebhookAction, {});

  const unlocked = overview.entitlements.developerAccess && overview.entitlements.publicApi;

  if (!unlocked) {
    return (
      <section className="soft-card flex gap-4 p-6">
        <LockIcon className="mt-1 text-text-muted" size={22} />
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Developer access is locked</h2>
          <p className="mt-2 max-w-2xl text-sm text-text-secondary">
            API keys and webhooks are available on Pro and Business plans. Your existing data stays readable; developer automation unlocks after upgrading.
          </p>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="soft-card-sm grid gap-4 p-5 sm:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-text-muted">API keys</p>
          <p className="mt-1 text-xl font-semibold text-text-primary">{limitLabel(overview.usage.apiKeys.used, overview.usage.apiKeys.limit)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-text-muted">Webhooks</p>
          <p className="mt-1 text-xl font-semibold text-text-primary">{limitLabel(overview.usage.webhooks.used, overview.usage.webhooks.limit)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-text-muted">API requests</p>
          <p className="mt-1 text-xl font-semibold text-text-primary">{limitLabel(overview.usage.apiRequestsMonthly.used, overview.usage.apiRequestsMonthly.limit)}</p>
        </div>
      </section>

      <section className="soft-card-sm p-5">
        <div className="flex items-center gap-2">
          <KeyRoundIcon size={18} className="text-text-muted" />
          <h2 className="text-sm font-semibold text-text-primary">API keys</h2>
        </div>

        {createKeyState.rawKey && (
          <div className="mt-4 rounded-(--neu-radius-md) border border-accent-green bg-accent-green-soft/25 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">New key</p>
            <code className="mt-2 block break-all text-sm font-semibold text-text-primary">{createKeyState.rawKey}</code>
          </div>
        )}
        {(createKeyState.error || revokeKeyState.error) && <p className="mt-3 text-sm font-medium text-danger">{createKeyState.error ?? revokeKeyState.error}</p>}
        {(createKeyState.success || revokeKeyState.success) && <p className="mt-3 text-sm text-text-secondary">{createKeyState.success ?? revokeKeyState.success}</p>}

        {overview.canManage && (
          <form action={createKeyAction} className="mt-5 space-y-4">
            <Input name="name" label="Name" placeholder="Production integration" required minLength={2} maxLength={120} />
            <div>
              <p className="mb-3 text-sm font-medium text-text-secondary">Scopes</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {DEVELOPER_API_KEY_SCOPES.map((scope) => (
                  <OptionCheckbox key={scope} id={`scope-${scope}`} name="scopes" value={scope} />
                ))}
              </div>
            </div>
            <Button type="submit" disabled={creatingKey}>Create API key</Button>
          </form>
        )}

        <div className="mt-6 divide-y divide-border-soft">
          {overview.apiKeys.length === 0 && <p className="text-sm text-text-muted">No API keys yet.</p>}
          {overview.apiKeys.map((key) => (
            <div key={key.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-text-primary">{key.name}</p>
                <p className="text-xs text-text-muted">{key.key_prefix}... · {key.revoked_at ? "Revoked" : "Active"} · {key.scopes.join(", ")}</p>
              </div>
              {overview.canManage && !key.revoked_at && (
                <form action={revokeKeyAction}>
                  <input type="hidden" name="apiKeyId" value={key.id} />
                  <Button type="submit" variant="danger" disabled={revokingKey}><RotateCcwIcon size={14} /> Revoke</Button>
                </form>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="soft-card-sm p-5">
        <div className="flex items-center gap-2">
          <PlugZapIcon size={18} className="text-text-muted" />
          <h2 className="text-sm font-semibold text-text-primary">Webhooks</h2>
        </div>

        {createWebhookState.rawSecret && (
          <div className="mt-4 rounded-(--neu-radius-md) border border-accent-green bg-accent-green-soft/25 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Signing secret</p>
            <code className="mt-2 block break-all text-sm font-semibold text-text-primary">{createWebhookState.rawSecret}</code>
          </div>
        )}
        {(createWebhookState.error || disableWebhookState.error) && <p className="mt-3 text-sm font-medium text-danger">{createWebhookState.error ?? disableWebhookState.error}</p>}
        {(createWebhookState.success || disableWebhookState.success) && <p className="mt-3 text-sm text-text-secondary">{createWebhookState.success ?? disableWebhookState.success}</p>}

        {overview.canManage && overview.entitlements.developerWebhooks && (
          <form action={createWebhookAction} className="mt-5 space-y-4">
            <Input name="url" label="Endpoint URL" placeholder="https://example.com/nevora/webhook" required />
            <div>
              <p className="mb-3 text-sm font-medium text-text-secondary">Events</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {DEVELOPER_WEBHOOK_EVENTS.map((event) => (
                  <OptionCheckbox key={event} id={`event-${event}`} name="events" value={event} />
                ))}
              </div>
            </div>
            <Button type="submit" disabled={creatingWebhook}>Create webhook</Button>
          </form>
        )}

        <div className="mt-6 divide-y divide-border-soft">
          {overview.webhooks.length === 0 && <p className="text-sm text-text-muted">No webhooks yet.</p>}
          {overview.webhooks.map((webhook) => (
            <div key={webhook.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="break-all font-medium text-text-primary">{webhook.url}</p>
                <p className="text-xs text-text-muted">{webhook.is_active ? "Active" : "Disabled"} · {webhook.events.join(", ")}</p>
              </div>
              {overview.canManage && webhook.is_active && (
                <form action={disableWebhookAction}>
                  <input type="hidden" name="webhookId" value={webhook.id} />
                  <Button type="submit" variant="secondary" disabled={disablingWebhook}>Disable</Button>
                </form>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
