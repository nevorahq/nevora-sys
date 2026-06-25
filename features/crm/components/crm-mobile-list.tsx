"use client";

import { useState, useCallback } from "react";
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

function ownerLabel(userId: string | null, map: Record<string, string>): string | null {
  if (!userId) return null;
  return map[userId] ?? null;
}

function MobileCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-(--neu-radius-lg) border border-border-soft bg-surface p-3.5 shadow-neu-sm">
      {children}
    </div>
  );
}

function MobileBulkBar({ count, onClear }: { count: number; onClear: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-(--neu-radius-md) border border-border-soft bg-surface px-3 py-2.5 text-sm shadow-neu-sm">
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
      {/* No bulk server action yet — placeholder */}
      <button disabled title="Coming soon" className="cursor-not-allowed text-text-muted opacity-40">
        Archive
      </button>
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type CRMMobileListProps =
  | { section: "leads"; data: CrmClient[]; hasFilters: boolean; membersMap?: Record<string, string> }
  | { section: "clients"; data: CrmClient[]; hasFilters: boolean; membersMap?: Record<string, string> }
  | { section: "contacts"; data: CrmContact[]; hasFilters: boolean; membersMap?: Record<string, string> }
  | { section: "deals"; data: CrmDealWithStage[]; hasFilters: boolean; membersMap?: Record<string, string> }
  | { section: "activities"; data: CrmActivity[]; hasFilters: boolean; membersMap?: Record<string, string> };

export function CRMMobileList(props: CRMMobileListProps) {
  const membersMap = props.membersMap ?? {};
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

  if (props.data.length === 0) {
    return <CRMEmptyState section={props.section} filtered={props.hasFilters} />;
  }

  if (props.section === "leads" || props.section === "clients") {
    return (
      <div className="flex flex-col gap-2">
        {props.data.map((c) => {
          const ownerName = ownerLabel(c.assigned_to, membersMap);
          return (
            <MobileCard key={c.id}>
              <input
                type="checkbox"
                checked={selectedIds.has(c.id)}
                onChange={() => toggleRow(c.id)}
                className="h-4 w-4 shrink-0 cursor-pointer rounded border-border-soft"
                aria-label={`Select ${c.name}`}
              />
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-text-primary">{c.name}</p>
                  <CRMStatusBadge status={c.status} />
                </div>
                <p className="truncate text-xs text-text-muted">
                  {c.email ?? c.company ?? "—"} · {formatDate(c.created_at)}
                </p>
                {ownerName && (
                  <p className="truncate text-xs text-text-muted">Owner: {ownerName}</p>
                )}
              </div>
              <CRMRowMenu id={c.id} />
            </MobileCard>
          );
        })}
        {selectedIds.size > 0 && (
          <MobileBulkBar count={selectedIds.size} onClear={() => setSelectedIds(new Set())} />
        )}
      </div>
    );
  }

  if (props.section === "contacts") {
    return (
      <div className="flex flex-col gap-2">
        {props.data.map((c) => (
          <MobileCard key={c.id}>
            <input
              type="checkbox"
              checked={selectedIds.has(c.id)}
              onChange={() => toggleRow(c.id)}
              className="h-4 w-4 shrink-0 cursor-pointer rounded border-border-soft"
              aria-label={`Select ${c.first_name}`}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-text-primary">
                {c.first_name}
                {c.last_name ? ` ${c.last_name}` : ""}
              </p>
              <p className="truncate text-xs text-text-muted">
                {c.email ?? "No email"} · {formatDate(c.created_at)}
              </p>
            </div>
            {c.is_primary && <CRMStatusBadge status="primary" className="shrink-0" />}
            <CRMRowMenu id={c.id} />
          </MobileCard>
        ))}
        {selectedIds.size > 0 && (
          <MobileBulkBar count={selectedIds.size} onClear={() => setSelectedIds(new Set())} />
        )}
      </div>
    );
  }

  if (props.section === "deals") {
    return (
      <div className="flex flex-col gap-2">
        {props.data.map((d) => {
          const ownerName = ownerLabel(d.assigned_to, membersMap);
          return (
            <MobileCard key={d.id}>
              <input
                type="checkbox"
                checked={selectedIds.has(d.id)}
                onChange={() => toggleRow(d.id)}
                className="h-4 w-4 shrink-0 cursor-pointer rounded border-border-soft"
                aria-label={`Select ${d.title}`}
              />
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-text-primary">{d.title}</p>
                  <CRMStatusBadge status={d.status} />
                </div>
                <p className="truncate text-xs text-text-muted">
                  {d.client?.name ?? "No client"}
                  {d.value != null ? ` · ${d.currency} ${Number(d.value).toLocaleString()}` : ""}
                </p>
                {ownerName && (
                  <p className="truncate text-xs text-text-muted">Owner: {ownerName}</p>
                )}
              </div>
              <CRMRowMenu id={d.id} />
            </MobileCard>
          );
        })}
        {selectedIds.size > 0 && (
          <MobileBulkBar count={selectedIds.size} onClear={() => setSelectedIds(new Set())} />
        )}
      </div>
    );
  }

  // activities
  return (
    <div className="flex flex-col gap-2">
      {props.data.map((a) => (
        <MobileCard key={a.id}>
          <input
            type="checkbox"
            checked={selectedIds.has(a.id)}
            onChange={() => toggleRow(a.id)}
            className="h-4 w-4 shrink-0 cursor-pointer rounded border-border-soft"
            aria-label={`Select ${a.title}`}
          />
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 flex items-center gap-2">
              <p className="truncate text-sm font-medium text-text-primary">{a.title}</p>
              <CRMStatusBadge status={a.activity_type} />
            </div>
            <p className="text-xs text-text-muted">
              {a.entity_type} ·{" "}
              {a.scheduled_at ? formatDate(a.scheduled_at) : formatDate(a.created_at)}
            </p>
          </div>
          {a.completed ? (
            <span className="soft-badge shrink-0 bg-accent-green-soft text-text-primary">Done</span>
          ) : (
            <span className="soft-badge shrink-0 bg-accent-yellow-soft text-text-primary">Pending</span>
          )}
          <CRMRowMenu id={a.id} />
        </MobileCard>
      ))}
      {selectedIds.size > 0 && (
        <MobileBulkBar count={selectedIds.size} onClear={() => setSelectedIds(new Set())} />
      )}
    </div>
  );
}
