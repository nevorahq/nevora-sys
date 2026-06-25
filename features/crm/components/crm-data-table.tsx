"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { XIcon } from "lucide-react";
import { formatDate } from "@/shared/utils/format-date";
import { CRMStatusBadge } from "./crm-status-badge";
import { CRMRowMenu } from "./crm-row-menu";
import { CRMEmptyState } from "./crm-empty-state";
import type {
  CrmClient,
  CrmContact,
  CrmDealWithStage,
  CrmActivity,
} from "@/modules/crm/types/crm.types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function ownerLabel(userId: string | null, map: Record<string, string>): string {
  if (!userId) return "Unassigned";
  return map[userId] ?? "Unassigned";
}

function OwnerCell({
  userId,
  membersMap,
}: {
  userId: string | null;
  membersMap: Record<string, string>;
}) {
  const label = ownerLabel(userId, membersMap);
  const isUnassigned = !userId || !membersMap[userId];
  return (
    <span className={isUnassigned ? "text-xs text-text-muted" : "text-sm text-text-secondary"}>
      {label}
    </span>
  );
}

// ── Selection state + bulk bar ────────────────────────────────────────────────

function BulkBar({
  count,
  onClear,
}: {
  count: number;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-3 border-t border-border-soft bg-surface-sunken px-4 py-2.5 text-sm rounded-b-(--neu-radius-lg)">
      <span className="font-medium text-text-primary">{count} selected</span>
      <span className="text-text-muted" aria-hidden>·</span>
      <button
        onClick={onClear}
        className="inline-flex items-center gap-1 text-text-muted hover:text-text-primary transition-colors"
      >
        <XIcon size={12} aria-hidden />
        Clear
      </button>
      <span className="text-text-muted" aria-hidden>·</span>
      {/* Bulk archive: no server action exists yet — UI placeholder */}
      <button
        disabled
        title="Coming soon"
        className="cursor-not-allowed text-text-muted opacity-40"
      >
        Archive
      </button>
    </div>
  );
}

function HeaderCheckbox({
  total,
  selected,
  onToggleAll,
}: {
  total: number;
  selected: number;
  onToggleAll: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.indeterminate = selected > 0 && selected < total;
  }, [selected, total]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={total > 0 && selected === total}
      onChange={onToggleAll}
      className="h-4 w-4 cursor-pointer rounded border-border-soft"
      aria-label="Select all"
    />
  );
}

// ── Table primitives ──────────────────────────────────────────────────────────

function TH({ children }: { children: React.ReactNode }) {
  return (
    <th className="border-b border-border-soft bg-surface-sunken px-4 py-2.5 text-left text-xs font-medium text-text-muted">
      {children}
    </th>
  );
}

function TD({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td className={`px-4 py-3 text-sm align-middle text-text-primary ${className ?? ""}`}>
      {children}
    </td>
  );
}

function TR({
  children,
  selected,
}: {
  children: React.ReactNode;
  selected?: boolean;
}) {
  return (
    <tr
      className={`border-b border-border-soft last:border-0 transition-colors ${
        selected ? "bg-info-soft/30" : "hover:bg-surface-sunken/40"
      }`}
    >
      {children}
    </tr>
  );
}

// ── Leads / Clients ───────────────────────────────────────────────────────────

function ClientsTable({
  section,
  data,
  hasFilters,
  membersMap,
}: {
  section: "leads" | "clients";
  data: CrmClient[];
  hasFilters: boolean;
  membersMap: Record<string, string>;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) =>
      prev.size === data.length ? new Set() : new Set(data.map((c) => c.id)),
    );
  }, [data]);

  if (data.length === 0) return <CRMEmptyState section={section} filtered={hasFilters} />;

  return (
    <div className="overflow-x-auto rounded-(--neu-radius-lg) border border-border-soft bg-surface shadow-neu-sm">
      <table className="w-full min-w-[760px] text-sm" role="grid" aria-label={section}>
        <thead>
          <tr>
            <TH>
              <HeaderCheckbox
                total={data.length}
                selected={selectedIds.size}
                onToggleAll={toggleAll}
              />
            </TH>
            <TH>Name</TH>
            <TH>Email</TH>
            <TH>Phone</TH>
            <TH>Source</TH>
            <TH>Owner</TH>
            <TH>Status</TH>
            <TH>Created</TH>
            <TH><span className="sr-only">Actions</span></TH>
          </tr>
        </thead>
        <tbody>
          {data.map((c) => (
            <TR key={c.id} selected={selectedIds.has(c.id)}>
              <TD className="w-10">
                <input
                  type="checkbox"
                  checked={selectedIds.has(c.id)}
                  onChange={() => toggleRow(c.id)}
                  className="h-4 w-4 cursor-pointer rounded border-border-soft"
                  aria-label={`Select ${c.name}`}
                />
              </TD>
              <TD>
                <p className="max-w-[160px] truncate font-medium">{c.name}</p>
                {c.company && (
                  <p className="max-w-[160px] truncate text-xs text-text-muted">{c.company}</p>
                )}
              </TD>
              <TD className="max-w-[160px] truncate text-text-secondary">{c.email ?? "—"}</TD>
              <TD className="whitespace-nowrap text-text-secondary">{c.phone ?? "—"}</TD>
              <TD className="capitalize text-text-muted">{c.source}</TD>
              <TD>
                <OwnerCell userId={c.assigned_to} membersMap={membersMap} />
              </TD>
              <TD><CRMStatusBadge status={c.status} /></TD>
              <TD className="whitespace-nowrap text-text-muted">{formatDate(c.created_at)}</TD>
              <TD className="w-10 pr-3">
                <CRMRowMenu id={c.id} />
              </TD>
            </TR>
          ))}
        </tbody>
      </table>
      {selectedIds.size > 0 && (
        <BulkBar count={selectedIds.size} onClear={() => setSelectedIds(new Set())} />
      )}
    </div>
  );
}

// ── Contacts ──────────────────────────────────────────────────────────────────

function ContactsTable({
  data,
  hasFilters,
}: {
  data: CrmContact[];
  hasFilters: boolean;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) =>
      prev.size === data.length ? new Set() : new Set(data.map((c) => c.id)),
    );
  }, [data]);

  if (data.length === 0) return <CRMEmptyState section="contacts" filtered={hasFilters} />;

  return (
    <div className="overflow-x-auto rounded-(--neu-radius-lg) border border-border-soft bg-surface shadow-neu-sm">
      <table className="w-full min-w-[640px] text-sm" role="grid" aria-label="contacts">
        <thead>
          <tr>
            <TH>
              <HeaderCheckbox
                total={data.length}
                selected={selectedIds.size}
                onToggleAll={toggleAll}
              />
            </TH>
            <TH>Name</TH>
            <TH>Email</TH>
            <TH>Phone</TH>
            <TH>Position</TH>
            <TH>Primary</TH>
            <TH>Created</TH>
            <TH><span className="sr-only">Actions</span></TH>
          </tr>
        </thead>
        <tbody>
          {data.map((c) => (
            <TR key={c.id} selected={selectedIds.has(c.id)}>
              <TD className="w-10">
                <input
                  type="checkbox"
                  checked={selectedIds.has(c.id)}
                  onChange={() => toggleRow(c.id)}
                  className="h-4 w-4 cursor-pointer rounded border-border-soft"
                  aria-label={`Select ${c.first_name}`}
                />
              </TD>
              <TD>
                <p className="max-w-[160px] truncate font-medium">
                  {c.first_name}
                  {c.last_name ? ` ${c.last_name}` : ""}
                </p>
              </TD>
              <TD className="max-w-[180px] truncate text-text-secondary">{c.email ?? "—"}</TD>
              <TD className="whitespace-nowrap text-text-secondary">{c.phone ?? "—"}</TD>
              <TD className="text-text-muted">{c.position ?? "—"}</TD>
              <TD>
                {c.is_primary ? (
                  <CRMStatusBadge status="primary" />
                ) : (
                  <span className="text-xs text-text-muted">—</span>
                )}
              </TD>
              <TD className="whitespace-nowrap text-text-muted">{formatDate(c.created_at)}</TD>
              <TD className="w-10 pr-3">
                <CRMRowMenu id={c.id} />
              </TD>
            </TR>
          ))}
        </tbody>
      </table>
      {selectedIds.size > 0 && (
        <BulkBar count={selectedIds.size} onClear={() => setSelectedIds(new Set())} />
      )}
    </div>
  );
}

// ── Deals ─────────────────────────────────────────────────────────────────────

function DealsTable({
  data,
  hasFilters,
  membersMap,
}: {
  data: CrmDealWithStage[];
  hasFilters: boolean;
  membersMap: Record<string, string>;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) =>
      prev.size === data.length ? new Set() : new Set(data.map((d) => d.id)),
    );
  }, [data]);

  if (data.length === 0) return <CRMEmptyState section="deals" filtered={hasFilters} />;

  return (
    <div className="overflow-x-auto rounded-(--neu-radius-lg) border border-border-soft bg-surface shadow-neu-sm">
      <table className="w-full min-w-[820px] text-sm" role="grid" aria-label="deals">
        <thead>
          <tr>
            <TH>
              <HeaderCheckbox
                total={data.length}
                selected={selectedIds.size}
                onToggleAll={toggleAll}
              />
            </TH>
            <TH>Title</TH>
            <TH>Client</TH>
            <TH>Value</TH>
            <TH>Stage</TH>
            <TH>Owner</TH>
            <TH>Status</TH>
            <TH>Close date</TH>
            <TH><span className="sr-only">Actions</span></TH>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <TR key={d.id} selected={selectedIds.has(d.id)}>
              <TD className="w-10">
                <input
                  type="checkbox"
                  checked={selectedIds.has(d.id)}
                  onChange={() => toggleRow(d.id)}
                  className="h-4 w-4 cursor-pointer rounded border-border-soft"
                  aria-label={`Select ${d.title}`}
                />
              </TD>
              <TD>
                <p className="max-w-[180px] truncate font-medium">{d.title}</p>
              </TD>
              <TD className="max-w-[120px] truncate text-text-secondary">
                {d.client?.name ?? "—"}
              </TD>
              <TD className="whitespace-nowrap font-medium">
                {d.value != null
                  ? `${d.currency} ${Number(d.value).toLocaleString()}`
                  : "—"}
              </TD>
              <TD>
                <span className="inline-flex items-center gap-1.5">
                  {d.stage?.color && (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: d.stage.color }}
                      aria-hidden
                    />
                  )}
                  <span className="max-w-[100px] truncate text-xs text-text-secondary">
                    {d.stage?.name ?? "—"}
                  </span>
                </span>
              </TD>
              <TD>
                <OwnerCell userId={d.assigned_to} membersMap={membersMap} />
              </TD>
              <TD><CRMStatusBadge status={d.status} /></TD>
              <TD className="whitespace-nowrap text-text-muted">
                {d.expected_close_date ? formatDate(d.expected_close_date) : "—"}
              </TD>
              <TD className="w-10 pr-3">
                <CRMRowMenu id={d.id} />
              </TD>
            </TR>
          ))}
        </tbody>
      </table>
      {selectedIds.size > 0 && (
        <BulkBar count={selectedIds.size} onClear={() => setSelectedIds(new Set())} />
      )}
    </div>
  );
}

// ── Activities ────────────────────────────────────────────────────────────────

function ActivitiesTable({
  data,
  hasFilters,
}: {
  data: CrmActivity[];
  hasFilters: boolean;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) =>
      prev.size === data.length ? new Set() : new Set(data.map((a) => a.id)),
    );
  }, [data]);

  if (data.length === 0) return <CRMEmptyState section="activities" filtered={hasFilters} />;

  return (
    <div className="overflow-x-auto rounded-(--neu-radius-lg) border border-border-soft bg-surface shadow-neu-sm">
      <table className="w-full min-w-[680px] text-sm" role="grid" aria-label="activities">
        <thead>
          <tr>
            <TH>
              <HeaderCheckbox
                total={data.length}
                selected={selectedIds.size}
                onToggleAll={toggleAll}
              />
            </TH>
            <TH>Title</TH>
            <TH>Type</TH>
            <TH>Related to</TH>
            <TH>Status</TH>
            <TH>Scheduled</TH>
            <TH>Created</TH>
            <TH><span className="sr-only">Actions</span></TH>
          </tr>
        </thead>
        <tbody>
          {data.map((a) => (
            <TR key={a.id} selected={selectedIds.has(a.id)}>
              <TD className="w-10">
                <input
                  type="checkbox"
                  checked={selectedIds.has(a.id)}
                  onChange={() => toggleRow(a.id)}
                  className="h-4 w-4 cursor-pointer rounded border-border-soft"
                  aria-label={`Select ${a.title}`}
                />
              </TD>
              <TD>
                <p className="max-w-[200px] truncate font-medium">{a.title}</p>
              </TD>
              <TD><CRMStatusBadge status={a.activity_type} /></TD>
              <TD className="capitalize text-xs text-text-secondary">{a.entity_type}</TD>
              <TD>
                {a.completed ? (
                  <span className="soft-badge bg-accent-green-soft text-text-primary">Done</span>
                ) : (
                  <span className="soft-badge bg-accent-yellow-soft text-text-primary">Pending</span>
                )}
              </TD>
              <TD className="whitespace-nowrap text-text-muted">
                {a.scheduled_at ? formatDate(a.scheduled_at) : "—"}
              </TD>
              <TD className="whitespace-nowrap text-text-muted">{formatDate(a.created_at)}</TD>
              <TD className="w-10 pr-3">
                <CRMRowMenu id={a.id} />
              </TD>
            </TR>
          ))}
        </tbody>
      </table>
      {selectedIds.size > 0 && (
        <BulkBar count={selectedIds.size} onClear={() => setSelectedIds(new Set())} />
      )}
    </div>
  );
}

// ── Public export ─────────────────────────────────────────────────────────────

export type CRMDataTableProps =
  | { section: "leads"; data: CrmClient[]; hasFilters: boolean; membersMap?: Record<string, string> }
  | { section: "clients"; data: CrmClient[]; hasFilters: boolean; membersMap?: Record<string, string> }
  | { section: "contacts"; data: CrmContact[]; hasFilters: boolean; membersMap?: Record<string, string> }
  | { section: "deals"; data: CrmDealWithStage[]; hasFilters: boolean; membersMap?: Record<string, string> }
  | { section: "activities"; data: CrmActivity[]; hasFilters: boolean; membersMap?: Record<string, string> };

export function CRMDataTable(props: CRMDataTableProps) {
  const membersMap = props.membersMap ?? {};
  switch (props.section) {
    case "leads":
    case "clients":
      return (
        <ClientsTable
          section={props.section}
          data={props.data}
          hasFilters={props.hasFilters}
          membersMap={membersMap}
        />
      );
    case "contacts":
      return <ContactsTable data={props.data} hasFilters={props.hasFilters} />;
    case "deals":
      return (
        <DealsTable
          data={props.data}
          hasFilters={props.hasFilters}
          membersMap={membersMap}
        />
      );
    case "activities":
      return <ActivitiesTable data={props.data} hasFilters={props.hasFilters} />;
  }
}
