"use client";

import { useActionState } from "react";
import { updateProfile } from "../actions/update-profile";
import { AvatarUploader } from "./AvatarUploader";
import type { ProfileSettings, SettingsActionState } from "../types/settings.types";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { Button } from "@/shared/ui/button";

const TIMEZONES = ["UTC", "Europe/Chisinau", "Europe/Bucharest", "Europe/London", "America/New_York", "Asia/Dubai"];

export function ProfileForm({ profile, t }: { profile: ProfileSettings; t: Dictionary["settings"] }) {
  const [state, action, pending] = useActionState<SettingsActionState, FormData>(updateProfile, {});
  const initials = profile.fullName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";

  return (
    <div className="soft-card space-y-6 p-5 sm:p-6">
      <AvatarUploader avatarUrl={profile.avatarUrl} initials={initials} />

      <form action={action} className="space-y-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <Input id="fullName" name="fullName" label={t.profile.fullName} defaultValue={profile.fullName} error={state.fieldErrors?.fullName?.[0]} required />
          <Input id="email" name="email" type="email" label={t.profile.email} defaultValue={profile.email} disabled aria-describedby="email-help" />
          <Input id="phone" name="phone" type="tel" label={t.profile.phone} defaultValue={profile.phone} error={state.fieldErrors?.phone?.[0]} />
          <Select id="language" name="language" label={t.profile.language} defaultValue={profile.language} options={[{ value: "en", label: "English" }, { value: "ru", label: "Русский" }, { value: "ro", label: "Română" }]} error={state.fieldErrors?.language?.[0]} />
          <Select id="timezone" name="timezone" label={t.profile.timezone} defaultValue={profile.timezone} options={TIMEZONES.map((value) => ({ value, label: value }))} error={state.fieldErrors?.timezone?.[0]} />
        </div>
        <p id="email-help" className="text-xs text-text-muted">{t.profile.emailHelp}</p>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-soft pt-5">
          <p aria-live="polite" className={state.error ? "text-sm text-danger" : "text-sm text-accent-green"}>{state.error ?? state.success}</p>
          <Button type="submit" isLoading={pending}>{pending ? t.common.saving : t.common.save}</Button>
        </div>
      </form>
    </div>
  );
}
