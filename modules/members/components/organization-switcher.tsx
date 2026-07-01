"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2Icon } from "lucide-react";
import { switchOrganizationAction } from "../actions/switch-organization.action";
import type { UserOrganization } from "../queries/get-user-organizations";

interface OrganizationSwitcherProps {
  currentOrganizationId: string;
  organizations: UserOrganization[];
}

/**
 * Минимальный переключатель организаций для dashboard-хедера.
 *
 * Single-org пользователи ничего нового не видят (return null) — поведение
 * не меняется. Появляется только когда у пользователя ≥2 active membership.
 *
 * organization_id никогда не читается из localStorage/клиентского state как
 * источник авторизации — выбор идёт через switchOrganizationAction,
 * которая проверяет active membership на сервере перед сохранением cookie.
 */
export function OrganizationSwitcher({ currentOrganizationId, organizations }: OrganizationSwitcherProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (organizations.length <= 1) return null;

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const organizationId = e.target.value;
    if (organizationId === currentOrganizationId) return;
    setError(null);
    startTransition(async () => {
      const res = await switchOrganizationAction({ organizationId });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Building2Icon size={14} className="shrink-0 text-text-muted" />
      <select
        value={currentOrganizationId}
        onChange={handleChange}
        disabled={isPending}
        aria-label="Switch organization"
        className="max-w-40 truncate rounded-(--neu-radius) border-none bg-transparent py-0.5 text-sm font-medium text-text-primary outline-none disabled:opacity-60"
      >
        {organizations.map((org) => (
          <option key={org.id} value={org.id}>
            {org.name}
          </option>
        ))}
      </select>
      {error && (
        <span className="text-xs text-danger" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
