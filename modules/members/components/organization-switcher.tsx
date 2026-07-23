"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronsUpDownIcon } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { switchOrganizationAction } from "../actions/switch-organization.action";
import type { UserOrganization } from "../queries/get-user-organizations";

interface OrganizationSwitcherProps {
  currentOrganizationId: string;
  organizations: UserOrganization[];
  t: Dictionary["organizationSwitcher"];
}

/**
 * Header organization switcher.
 *
 * The control doubles as the tenant indicator, so it is styled as a distinct
 * chip rather than bare text: with two organizations the current one is the
 * only thing standing between the user and posting an expense into the wrong
 * business, and data isolation is a P0 invariant. The organization initial,
 * a visible border and the chevron all exist to make "where am I" and "this is
 * changeable" readable at a glance.
 *
 * Single-org users still see nothing (return null) — there is no ambiguity to
 * resolve and no reason to spend header space.
 *
 * organization_id is never read from client state as a source of authority: the
 * choice goes through switchOrganizationAction, which verifies active
 * membership on the server before writing the cookie.
 */
export function OrganizationSwitcher({ currentOrganizationId, organizations, t }: OrganizationSwitcherProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (organizations.length <= 1) return null;

  const current = organizations.find((org) => org.id === currentOrganizationId);
  const initial = (current?.name ?? "?").trim().charAt(0).toUpperCase();

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
    <div className="flex min-w-0 items-center gap-2">
      <div
        className={cn(
          "relative flex min-w-0 items-center rounded-(--neu-radius) border border-border-soft bg-surface-sunken",
          isPending && "opacity-60",
        )}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-(--neu-radius-sm) bg-accent-lilac-soft text-[10px] font-bold text-accent-lilac"
        >
          {initial}
        </span>
        <select
          value={currentOrganizationId}
          onChange={handleChange}
          disabled={isPending}
          aria-label={t.ariaLabel}
          className="min-w-0 max-w-44 truncate appearance-none rounded-(--neu-radius) bg-transparent py-1.5 pl-9 pr-7 text-sm font-medium text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-border-strong disabled:cursor-wait"
        >
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
        <ChevronsUpDownIcon
          aria-hidden="true"
          size={13}
          className="pointer-events-none absolute right-2 shrink-0 text-text-muted"
        />
      </div>
      {isPending && <span className="text-xs text-text-muted">{t.switching}</span>}
      {error && (
        <span className="text-xs text-danger" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
