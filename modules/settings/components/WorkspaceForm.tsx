"use client";

import { useActionState } from "react";
import { ImageIcon } from "lucide-react";
import { updateWorkspace } from "../actions/update-workspace";
import type { SettingsActionState, WorkspaceSettings } from "../types/settings.types";
import { CURRENCY_NAMES, SUPPORTED_CURRENCIES } from "@/shared/config/currencies";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { Button } from "@/shared/ui/button";

const TIMEZONES = ["UTC", "Europe/Chisinau", "Europe/Bucharest", "Europe/London", "America/New_York", "Asia/Dubai"];
const BUSINESS_OPTIONS = [
  { value: "freelancer", label: "Freelancer" },
  { value: "beauty_services", label: "Beauty / Services" },
  { value: "small_business", label: "Small Business" },
  { value: "developer_agency", label: "Developer / Agency" },
  { value: "other", label: "Other" },
];

export function WorkspaceForm({ workspace }: { workspace: WorkspaceSettings }) {
  const [state, action, pending] = useActionState<SettingsActionState, FormData>(updateWorkspace, {});

  return (
    <form action={action} className="soft-card space-y-6 p-5 sm:p-6">
      <div className="flex items-center gap-4 border-b border-border-soft pb-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-(--neu-radius-md) bg-surface-sunken text-text-muted">
          <ImageIcon size={24} />
        </div>
        <div>
          <Button type="button" variant="secondary" disabled className="px-4 py-2">Upload logo</Button>
          <p className="mt-2 text-xs text-text-muted">Logo storage is not connected yet.</p>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Input id="organizationName" name="organizationName" label="Organization name" defaultValue={workspace.organizationName} error={state.fieldErrors?.organizationName?.[0]} required />
        <Input id="workspaceName" name="workspaceName" label="Workspace name" defaultValue={workspace.workspaceName} error={state.fieldErrors?.workspaceName?.[0]} required />
        <Select id="businessType" name="businessType" label="Business type" defaultValue={workspace.businessType} options={BUSINESS_OPTIONS} error={state.fieldErrors?.businessType?.[0]} />
        <Select id="defaultCurrency" name="defaultCurrency" label="Default currency" defaultValue={workspace.defaultCurrency} options={SUPPORTED_CURRENCIES.map((value) => ({ value, label: `${value} — ${CURRENCY_NAMES[value]}` }))} error={state.fieldErrors?.defaultCurrency?.[0]} />
        <Select id="defaultLanguage" name="defaultLanguage" label="Default language" defaultValue={workspace.defaultLanguage} options={[{ value: "en", label: "English" }, { value: "ru", label: "Русский" }]} error={state.fieldErrors?.defaultLanguage?.[0]} />
        <Select id="timezone" name="timezone" label="Timezone" defaultValue={workspace.timezone} options={TIMEZONES.map((value) => ({ value, label: value }))} error={state.fieldErrors?.timezone?.[0]} />
      </div>
      <p className="text-xs text-text-muted">Business type personalizes future templates and AI suggestions. It never enables CRM or other modules automatically.</p>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-soft pt-5">
        <p aria-live="polite" className={state.error ? "text-sm text-danger" : "text-sm text-accent-green"}>{state.error ?? state.success}</p>
        <Button type="submit" isLoading={pending}>{pending ? "Saving…" : "Save changes"}</Button>
      </div>
    </form>
  );
}
