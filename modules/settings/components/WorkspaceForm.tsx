"use client";

import { useActionState } from "react";
import { ImageIcon } from "lucide-react";
import { updateWorkspace } from "../actions/update-workspace";
import type { SettingsActionState, WorkspaceSettings } from "../types/settings.types";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { CURRENCY_NAMES, SUPPORTED_CURRENCIES } from "@/shared/config/currencies";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { Button } from "@/shared/ui/button";

const TIMEZONES = ["UTC", "Europe/Chisinau", "Europe/Bucharest", "Europe/London", "America/New_York", "Asia/Dubai"];

export function WorkspaceForm({ workspace, t }: { workspace: WorkspaceSettings; t: Dictionary["settings"] }) {
  const [state, action, pending] = useActionState<SettingsActionState, FormData>(updateWorkspace, {});
  const businessOptions = [
    { value: "freelancer", label: t.workspace.business.freelancer },
    { value: "beauty_services", label: t.workspace.business.beauty_services },
    { value: "small_business", label: t.workspace.business.small_business },
    { value: "developer_agency", label: t.workspace.business.developer_agency },
    { value: "other", label: t.workspace.business.other },
  ];

  return (
    <form action={action} className="soft-card space-y-6 p-5 sm:p-6">
      <div className="flex items-center gap-4 border-b border-border-soft pb-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-(--neu-radius-md) bg-surface-sunken text-text-muted">
          <ImageIcon size={24} />
        </div>
        <div>
          <Button type="button" variant="secondary" disabled className="px-4 py-2">{t.workspace.uploadLogo}</Button>
          <p className="mt-2 text-xs text-text-muted">{t.workspace.logoNotConnected}</p>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Input id="organizationName" name="organizationName" label={t.workspace.organizationName} defaultValue={workspace.organizationName} error={state.fieldErrors?.organizationName?.[0]} required />
        <Input id="workspaceName" name="workspaceName" label={t.workspace.workspaceName} defaultValue={workspace.workspaceName} error={state.fieldErrors?.workspaceName?.[0]} required />
        <Select id="businessType" name="businessType" label={t.workspace.businessType} defaultValue={workspace.businessType} options={businessOptions} error={state.fieldErrors?.businessType?.[0]} />
        <Select id="defaultCurrency" name="defaultCurrency" label={t.workspace.defaultCurrency} defaultValue={workspace.defaultCurrency} options={SUPPORTED_CURRENCIES.map((value) => ({ value, label: `${value} — ${CURRENCY_NAMES[value]}` }))} error={state.fieldErrors?.defaultCurrency?.[0]} />
        <Select id="defaultLanguage" name="defaultLanguage" label={t.workspace.defaultLanguage} defaultValue={workspace.defaultLanguage} options={[{ value: "en", label: "English" }, { value: "ru", label: "Русский" }, { value: "ro", label: "Română" }]} error={state.fieldErrors?.defaultLanguage?.[0]} />
        <Select id="timezone" name="timezone" label={t.workspace.timezone} defaultValue={workspace.timezone} options={TIMEZONES.map((value) => ({ value, label: value }))} error={state.fieldErrors?.timezone?.[0]} />
      </div>
      <p className="text-xs text-text-muted">{t.workspace.note}</p>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-soft pt-5">
        <p aria-live="polite" className={state.error ? "text-sm text-danger" : "text-sm text-accent-green"}>{state.error ?? state.success}</p>
        <Button type="submit" isLoading={pending}>{pending ? t.common.saving : t.common.save}</Button>
      </div>
    </form>
  );
}
