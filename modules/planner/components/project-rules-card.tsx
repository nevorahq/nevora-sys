"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderInputIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { deleteProjectRuleAction } from "../actions/delete-project-rule.action";

type ProjectRulesDict = Dictionary["channels"]["projectRules"];

export interface ProjectRuleView {
  id: string;
  signalType: keyof ProjectRulesDict["sources"];
  /** What the source shows as: "#acme-support", "bob@acme.com", "@acme.com". */
  sourceLabel: string;
  projectName: string | null;
  hits: number;
}

/**
 * Settings card: the user's learned project rules (migration 125) — "captures
 * from this source go to this project" — with a way to delete a wrong one.
 */
export function ProjectRulesCard({ t, rules }: { t: ProjectRulesDict; rules: ProjectRuleView[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function remove(id: string) {
    setError(null);
    setDeleting(id);
    start(async () => {
      const result = await deleteProjectRuleAction(id).catch(() => null);
      setDeleting(null);
      if (!result?.ok) {
        setError(t.deleteFailed);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="soft-card p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-info-soft text-info">
          <FolderInputIcon size={18} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-text-primary">{t.title}</h2>
          <p className="mt-1 text-sm text-text-muted">{t.description}</p>
        </div>
      </div>

      <div className="mt-5">
        {rules.length === 0 ? (
          <p className="text-sm text-text-muted">{t.empty}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border-soft">
            {rules.map((rule) => (
              <li key={rule.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0 text-sm">
                  <span className="mr-2 rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] font-semibold text-text-secondary">
                    {t.sources[rule.signalType]}
                  </span>
                  <span className="break-all font-medium text-text-primary">{rule.sourceLabel}</span>
                  <span className="text-text-tertiary"> → </span>
                  <span className="font-medium text-text-primary">{rule.projectName ?? t.unknownProject}</span>
                  {rule.hits > 0 && <span className="ml-2 text-xs text-text-tertiary">{t.uses.replace("{count}", String(rule.hits))}</span>}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => remove(rule.id)}
                  isLoading={pending && deleting === rule.id}
                  disabled={pending}
                  aria-label={`${t.delete}: ${rule.sourceLabel}`}
                >
                  <Trash2Icon size={15} aria-hidden />
                  <span className="hidden sm:inline">{t.delete}</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
