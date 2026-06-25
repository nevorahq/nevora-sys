"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef } from "react";
import { SearchIcon, XIcon, PlusIcon } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import type { CRMSection } from "./crm-section-tabs";
import type { OrgMember } from "@/modules/crm/queries/get-org-members";

const STATUS_OPTIONS: Partial<Record<CRMSection, { value: string; label: string }[]>> = {
  clients: [
    { value: "",         label: "All statuses" },
    { value: "lead",     label: "Lead" },
    { value: "prospect", label: "Prospect" },
    { value: "customer", label: "Customer" },
    { value: "churned",  label: "Churned" },
  ],
  deals: [
    { value: "",     label: "All statuses" },
    { value: "open", label: "Open" },
    { value: "won",  label: "Won" },
    { value: "lost", label: "Lost" },
  ],
  activities: [
    { value: "",        label: "All types" },
    { value: "call",    label: "Call" },
    { value: "email",   label: "Email" },
    { value: "meeting", label: "Meeting" },
    { value: "task",    label: "Task" },
    { value: "note",    label: "Note" },
  ],
};

// Owner filter only makes sense for sections with assigned_to
const OWNER_FILTER_SECTIONS: CRMSection[] = ["leads", "clients", "deals"];

const CREATE_LABELS: Record<CRMSection, string> = {
  leads:      "Add Lead",
  contacts:   "Add Contact",
  clients:    "Add Client",
  deals:      "Add Deal",
  activities: "Add Activity",
};

const SELECT_CLASS = cn(
  "soft-control py-2 pl-3 pr-8 text-sm appearance-none",
  "bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%236F6E70%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')]",
  "bg-[length:1rem] bg-[position:right_0.5rem_center] bg-no-repeat",
);

interface CRMToolbarProps {
  section: CRMSection;
  currentSearch: string;
  currentStatus: string;
  currentOwner: string;
  orgMembers: OrgMember[];
}

export function CRMToolbar({
  section,
  currentSearch,
  currentStatus,
  currentOwner,
  orgMembers,
}: CRMToolbarProps) {
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildUrl = useCallback(
    (overrides: { search?: string; status?: string; owner?: string; page?: never }) => {
      const params = new URLSearchParams();
      params.set("section", section);
      const search = overrides.search !== undefined ? overrides.search : currentSearch;
      const status = overrides.status !== undefined ? overrides.status : currentStatus;
      const owner  = overrides.owner  !== undefined ? overrides.owner  : currentOwner;
      if (search) params.set("search", search);
      if (status) params.set("status", status);
      if (owner)  params.set("owner", owner);
      return `/dashboard/crm?${params.toString()}`;
    },
    [section, currentSearch, currentStatus, currentOwner],
  );

  const handleSearch = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        router.push(buildUrl({ search: value }));
      }, 350);
    },
    [router, buildUrl],
  );

  const handleStatus = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      router.push(buildUrl({ status: e.target.value }));
    },
    [router, buildUrl],
  );

  const handleOwner = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      router.push(buildUrl({ owner: e.target.value }));
    },
    [router, buildUrl],
  );

  const handleReset = useCallback(() => {
    router.push(`/dashboard/crm?section=${section}`);
  }, [router, section]);

  const statusOptions = STATUS_OPTIONS[section];
  const showOwnerFilter = OWNER_FILTER_SECTIONS.includes(section) && orgMembers.length > 1;
  const hasFilters = Boolean(currentSearch || currentStatus || currentOwner);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      {/* Search */}
      <div className="relative flex-1">
        <SearchIcon
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          aria-hidden
        />
        <input
          key={section}
          type="search"
          placeholder={`Search ${section}…`}
          defaultValue={currentSearch}
          onChange={handleSearch}
          className="soft-control w-full py-2 pl-8 pr-4 text-sm"
          aria-label={`Search ${section}`}
        />
      </div>

      <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
        {/* Status / type filter */}
        {statusOptions && (
          <select
            key={`${section}-status`}
            value={currentStatus}
            onChange={handleStatus}
            className={SELECT_CLASS}
            aria-label="Filter by status"
          >
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )}

        {/* Owner filter */}
        {showOwnerFilter && (
          <select
            key={`${section}-owner`}
            value={currentOwner}
            onChange={handleOwner}
            className={SELECT_CLASS}
            aria-label="Filter by owner"
          >
            <option value="">All owners</option>
            <option value="__unassigned__">Unassigned</option>
            {orgMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName ?? "Member"}
              </option>
            ))}
          </select>
        )}

        {/* Reset */}
        {hasFilters && (
          <button
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 rounded-(--neu-radius-pill) border border-border-soft bg-surface px-3 py-2 text-sm text-text-muted shadow-neu-control transition-all hover:text-text-primary hover:shadow-neu-sm shrink-0"
            aria-label="Reset filters"
          >
            <XIcon size={13} aria-hidden />
            <span className="hidden sm:inline">Reset</span>
          </button>
        )}

        {/* Create */}
        <button
          className="inline-flex shrink-0 items-center gap-1.5 rounded-(--neu-radius-pill) bg-text-primary px-4 py-2 text-sm font-semibold text-text-inverse shadow-neu-control transition-all hover:shadow-neu-card active:shadow-neu-inset active:scale-[0.98]"
          aria-label={CREATE_LABELS[section]}
        >
          <PlusIcon size={14} strokeWidth={2.5} aria-hidden />
          <span className="hidden sm:inline">{CREATE_LABELS[section]}</span>
          <span className="sm:hidden">Add</span>
        </button>
      </div>
    </div>
  );
}
