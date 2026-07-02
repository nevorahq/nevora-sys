"use client";

import { useState, useTransition } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import type { CategoryRule } from "../queries/get-category-rules";
import { createCategoryRuleAction } from "../actions/create-category-rule.action";
import {
  deleteCategoryRuleAction,
  updateCategoryRuleAction,
} from "../actions/manage-category-rule.action";

interface CategoryRulesManagerProps {
  rules: CategoryRule[];
  categories: Array<{ id: string; name: string }>;
  labels: Dictionary["money"]["rules"];
  /** Only owner/admin may create or manage organization-wide rules. */
  canManageOrgRules: boolean;
  currentUserId: string;
}

/**
 * Rule management (Phase 5.1 §4.2): list + minimal create form + per-row
 * enable/disable, category change and delete. Deliberately no pattern
 * builder — a rule is an exact normalized-merchant match (057 semantics).
 */
export function CategoryRulesManager({
  rules,
  categories,
  labels,
  canManageOrgRules,
  currentUserId,
}: CategoryRulesManagerProps) {
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [merchant, setMerchant] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [scope, setScope] = useState<"private" | "organization">("private");
  const [priority, setPriority] = useState(100);

  function submitCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Org-wide rules affect every member's future transactions — confirm first.
    if (scope === "organization" && !window.confirm(labels.orgConfirm)) return;
    setError(null);
    startTransition(async () => {
      const result = await createCategoryRuleAction({ merchant, categoryId, scope, priority });
      if (result.error) {
        setError(result.error);
        return;
      }
      setMerchant("");
      setCategoryId("");
      setScope("private");
      setPriority(100);
    });
  }

  function run(id: string, action: () => Promise<{ error?: string }>) {
    setBusyId(id);
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
      setBusyId(null);
    });
  }

  return (
    <div className="space-y-6">
      {/* Create */}
      <form onSubmit={submitCreate} className="soft-card p-5">
        <h2 className="text-base font-semibold text-text-primary">{labels.createTitle}</h2>
        <p className="mt-1 text-xs text-text-muted">{labels.futureOnlyNote}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto_auto]">
          <label className="flex flex-col gap-1 text-xs font-medium text-text-secondary">
            {labels.merchantLabel}
            <input
              value={merchant}
              onChange={(event) => setMerchant(event.target.value)}
              placeholder={labels.merchantPlaceholder}
              maxLength={240}
              className="soft-control min-h-10 px-3 text-sm font-normal text-text-primary"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-text-secondary">
            {labels.categoryLabel}
            <select
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className="soft-control min-h-10 px-3 text-sm font-normal text-text-primary"
            >
              <option value="">—</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-text-secondary">
            {labels.scopeLabel}
            <select
              value={scope}
              onChange={(event) => setScope(event.target.value as "private" | "organization")}
              className="soft-control min-h-10 px-3 text-sm font-normal text-text-primary"
            >
              <option value="private">{labels.scopePrivate}</option>
              {canManageOrgRules && (
                <option value="organization">{labels.scopeOrganization}</option>
              )}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-text-secondary">
            {labels.priorityLabel}
            <input
              type="number"
              min={0}
              max={1000}
              step={10}
              value={priority}
              onChange={(event) => setPriority(Number(event.target.value))}
              className="soft-control min-h-10 w-24 px-3 text-sm font-normal text-text-primary"
            />
          </label>
          <button
            type="submit"
            disabled={
              pending ||
              merchant.trim().length < 2 ||
              !categoryId ||
              !Number.isInteger(priority) ||
              priority < 0 ||
              priority > 1000
            }
            className="mt-auto inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-text-primary px-4 text-sm font-semibold text-text-inverse disabled:opacity-50"
          >
            <PlusIcon size={14} /> {pending && !busyId ? labels.creating : labels.create}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-accent-pink">{error}</p>}
      </form>

      {/* List */}
      {rules.length === 0 ? (
        <div className="soft-card p-5 text-sm text-text-muted">{labels.empty}</div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {rules.map((rule) => {
            const isOrg = rule.visibility === "organization";
            const canManage = isOrg ? canManageOrgRules : rule.owner_user_id === currentUserId;
            const busy = pending && busyId === rule.id;
            return (
              <div key={rule.id} className="soft-card-sm flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {rule.normalized_merchant}
                    <span className="ml-2 inline-flex items-center rounded-full bg-surface-sunken px-2 py-0.5 text-xs font-medium text-text-secondary">
                      {isOrg ? labels.scopeBadgeOrganization : labels.scopeBadgePrivate}
                    </span>
                    {!rule.is_active && (
                      <span className="ml-1.5 inline-flex items-center rounded-full bg-accent-yellow-soft px-2 py-0.5 text-xs font-medium text-text-secondary">
                        {labels.inactive}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {labels.confirmations.replace("{count}", String(rule.confirmation_count))}
                    {rule.expense_context && ` · ${rule.expense_context.name}`}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <label className="sr-only" htmlFor={`rule-priority-${rule.id}`}>
                    {labels.priorityLabel}
                  </label>
                  <input
                    id={`rule-priority-${rule.id}`}
                    type="number"
                    min={0}
                    max={1000}
                    step={10}
                    defaultValue={rule.priority}
                    disabled={!canManage || busy}
                    onBlur={(event) => {
                      const nextPriority = Number(event.currentTarget.value);
                      if (Number.isInteger(nextPriority) && nextPriority !== rule.priority) {
                        run(rule.id, () =>
                          updateCategoryRuleAction({ ruleId: rule.id, priority: nextPriority }),
                        );
                      } else {
                        event.currentTarget.value = String(rule.priority);
                      }
                    }}
                    className="soft-control min-h-9 w-20 px-2 text-xs text-text-primary disabled:opacity-60"
                  />
                  <select
                    value={rule.category?.id ?? ""}
                    disabled={!canManage || busy}
                    onChange={(event) =>
                      event.target.value &&
                      run(rule.id, () =>
                        updateCategoryRuleAction({ ruleId: rule.id, categoryId: event.target.value }),
                      )
                    }
                    className="soft-control min-h-9 max-w-44 px-2 text-xs text-text-primary disabled:opacity-60"
                  >
                    <option value="">—</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                  {canManage && (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          run(rule.id, () =>
                            updateCategoryRuleAction({ ruleId: rule.id, isActive: !rule.is_active }),
                          )
                        }
                        className="min-h-9 rounded-lg bg-surface-sunken px-3 text-xs font-semibold text-text-secondary disabled:opacity-50"
                      >
                        {rule.is_active ? labels.disable : labels.enable}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={labels.delete}
                        onClick={() =>
                          window.confirm(labels.deleteConfirm) &&
                          run(rule.id, () => deleteCategoryRuleAction({ ruleId: rule.id }))
                        }
                        className="inline-flex min-h-9 items-center rounded-lg bg-accent-pink-soft px-3 text-xs font-semibold text-accent-pink disabled:opacity-50"
                      >
                        <Trash2Icon size={13} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
