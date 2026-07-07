"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ExternalLinkIcon, SparklesIcon } from "lucide-react";
import { Modal } from "@/shared/ui/modal";
import { Button } from "@/shared/ui/button";
import { Select } from "@/shared/ui/select";
import { RestrictedActionTooltip, useAccessGate } from "@/modules/billing/components/access-state";
import { ActionPriorityBadge } from "./action-priority-badge";
import { TYPE_LABELS, SOURCE_LABELS } from "../constants/action-center.constants";
import type { ActionDetail } from "../types/action-center.types";
import { getActionDetail } from "../actions/get-action-detail.action";
import { resolveActionItem } from "../actions/resolve-action-item";
import { dismissActionItem } from "../actions/dismiss-action-item";
import { snoozeActionItem } from "../actions/snooze-action-item";
import { assignActionItem } from "../actions/assign-action-item";
import { executeActionItem } from "../actions/execute-action-item";

interface Member {
  id: string;
  name: string;
}

interface ActionDetailDrawerProps {
  itemId: string | null;
  members: Member[];
  currentUserId: string;
  onClose: () => void;
  onMutated: () => void;
}

export function ActionDetailDrawer({ itemId, members, currentUserId, onClose, onMutated }: ActionDetailDrawerProps) {
  const [detail, setDetail] = useState<ActionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();
  const writeGate = useAccessGate("write");
  const executeGate = useAccessGate("execute");

  useEffect(() => {
    if (!itemId) return;
    let active = true;
    // setState вынесен из тела эффекта (deferred), чтобы не вызывать
    // каскадные ререндеры синхронно во время эффекта.
    const handle = setTimeout(async () => {
      setDetail(null);
      setError(null);
      setLoading(true);
      const d = await getActionDetail(itemId);
      if (!active) return;
      setDetail(d);
      setLoading(false);
    }, 0);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [itemId]);

  function afterTerminal() {
    onMutated();
    onClose();
  }

  async function reloadDetail() {
    if (!itemId) return;
    const d = await getActionDetail(itemId);
    setDetail(d);
    onMutated();
  }

  function run(kind: string, executeKind?: string, requiresConfirmation?: boolean) {
    if (!detail) return;
    const gate = kind === "execute" ? executeGate : writeGate;
    if (gate.blocked) {
      setError(gate.message);
      return;
    }
    if (requiresConfirmation && !window.confirm("This action changes business data. Continue?")) return;
    setError(null);
    startBusy(async () => {
      const id = detail.item.id;
      let res: { ok: boolean; error?: string };
      if (kind === "resolve") res = await resolveActionItem({ actionItemId: id });
      else if (kind === "dismiss") res = await dismissActionItem({ actionItemId: id });
      else if (kind === "snooze")
        res = await snoozeActionItem({ actionItemId: id, snoozedUntil: new Date(Date.now() + 86_400_000).toISOString() });
      else if (kind === "execute" && executeKind)
        res = await executeActionItem({ actionItemId: id, executeKind, confirmed: true });
      else res = { ok: false, error: "Unknown action" };

      if (!res.ok) {
        setError(res.error ?? "Action failed");
        return;
      }
      if (kind === "snooze") await reloadDetail();
      else afterTerminal();
    });
  }

  function changeAssignee(value: string) {
    if (!detail) return;
    if (writeGate.blocked) {
      setError(writeGate.message);
      return;
    }
    setError(null);
    startBusy(async () => {
      const res = await assignActionItem({
        actionItemId: detail.item.id,
        assigneeId: value === "" ? null : value,
      });
      if (!res.ok) setError(res.error ?? "Failed to assign");
      else await reloadDetail();
    });
  }

  const canAssign = detail?.availableActions.some((a) => a.kind === "assign") ?? false;

  return (
    <Modal isOpen={itemId !== null} onClose={onClose} title="Action details">
      {loading && <p className="py-6 text-sm text-text-muted">Loading…</p>}
      {!loading && !detail && <p className="py-6 text-sm text-text-muted">Action item not found.</p>}

      {detail && (
        <div className="space-y-5">
          <div>
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-base font-semibold text-text-primary">{detail.item.title}</h3>
              <ActionPriorityBadge priority={detail.item.priority} />
            </div>
            <p className="mt-1 text-xs text-text-muted">
              {SOURCE_LABELS[detail.item.source_type]} · {TYPE_LABELS[detail.item.type]} · {detail.item.status}
            </p>
            {detail.item.description && (
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-text-secondary">{detail.item.description}</p>
            )}
          </div>

          {detail.item.ai_generated && detail.item.ai_reason && (
            <div className="rounded-(--neu-radius) bg-accent-lilac-soft p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-accent-lilac">
                <SparklesIcon size={13} /> AI explanation
                {typeof detail.item.ai_confidence === "number" && (
                  <span className="text-text-muted">· {Math.round(detail.item.ai_confidence * 100)}% confidence</span>
                )}
              </p>
              <p className="mt-1 text-sm text-text-secondary">{detail.item.ai_reason}</p>
            </div>
          )}

          {detail.related.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">Related entities</p>
              <ul className="space-y-1.5">
                {detail.related.map((r) => (
                  <li key={r.link_id}>
                    {r.href ? (
                      <Link href={r.href} className="flex items-center justify-between gap-2 rounded-(--neu-radius) bg-surface-sunken px-3 py-2 text-sm text-text-secondary hover:text-text-primary">
                        <span className="min-w-0 truncate">{r.title}</span>
                        <span className="flex shrink-0 items-center gap-1.5 text-xs text-text-muted">
                          {r.relation_type} <ExternalLinkIcon size={12} />
                        </span>
                      </Link>
                    ) : (
                      <span className="block rounded-(--neu-radius) bg-surface-sunken px-3 py-2 text-sm text-text-secondary">{r.title}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {canAssign && (
            <div>
              <Select
                label="Assigned to"
                value={detail.item.assigned_to ?? ""}
                disabled={busy || writeGate.blocked}
                onChange={(e) => changeAssignee(e.target.value)}
                options={[
                  { value: "", label: "Unassigned" },
                  { value: currentUserId, label: "Me" },
                  ...members.filter((m) => m.id !== currentUserId).map((m) => ({ value: m.id, label: m.name })),
                ]}
              />
            </div>
          )}

          {detail.events.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">Audit trail</p>
              <ul className="space-y-1 text-xs text-text-muted">
                {detail.events.slice(0, 8).map((ev) => (
                  <li key={ev.id} className="flex items-center justify-between gap-2">
                    <span>{ev.event_name.replace("action_item.", "")}</span>
                    <span>{new Date(ev.created_at).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {error && <p className="text-sm text-accent-pink">{error}</p>}

          {detail.availableActions.filter((a) => a.kind !== "assign").length > 0 && (
            <div className="flex flex-wrap justify-end gap-2 border-t border-border-soft pt-4">
              {detail.availableActions
                .filter((a) => a.kind !== "assign")
                .map((a) => {
                  const gate = a.kind === "execute" ? executeGate : writeGate;
                  return (
                    <RestrictedActionTooltip key={`${a.kind}-${a.executeKind ?? ""}`} message={gate.blocked ? gate.message : a.label}>
                      <Button
                        type="button"
                        variant={a.requiresConfirmation ? "danger" : a.kind === "resolve" ? "primary" : "secondary"}
                        disabled={busy || gate.blocked}
                        onClick={() => run(a.kind, a.executeKind, a.requiresConfirmation)}
                      >
                        {a.label}
                      </Button>
                    </RestrictedActionTooltip>
                  );
                })}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
