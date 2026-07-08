import { AlertTriangleIcon, ArrowRightIcon, ShieldCheckIcon } from "lucide-react";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import type { DraftEffect, DraftExplanation as Explanation } from "../utils/explain-draft";

interface DraftExplanationProps {
  explanation: Explanation;
  dict: Dictionary["inbox"]["draft"];
}

/**
 * The "before you confirm" panel (Phase B / B3).
 *
 * Presentational and total: every branch of DraftEffect / DraftOrigin is rendered,
 * so a new effect kind cannot silently disappear from the UI — TypeScript's
 * exhaustiveness check on the switch below is the guard.
 */
export function DraftExplanation({ explanation, dict }: DraftExplanationProps) {
  const links = explanation.effects.filter((e) => e.kind === "link");
  const changes = explanation.effects.filter((e) => e.kind !== "link");

  return (
    <div className="mt-3 space-y-2.5 border-t border-border-soft pt-3 text-xs">
      <p className="font-medium text-text-secondary">{dict.prepared}</p>

      <Section label={dict.whyLabel}>
        <span className="text-text-secondary">{originText(explanation.origin, dict)}</span>
      </Section>

      {changes.length > 0 && (
        <Section label={dict.changesLabel}>
          <ul className="space-y-0.5">
            {changes.map((effect, i) => (
              <li key={i} className="text-text-secondary">
                {changeText(effect, dict)}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {links.length > 0 && (
        <Section label={dict.linksLabel}>
          <ul className="space-y-0.5">
            {links.map((effect, i) => (
              <li key={i} className="flex items-center gap-1.5 text-text-secondary">
                <EntityChip type={effect.fromType} dict={dict} />
                <ArrowRightIcon size={12} strokeWidth={2} className="text-text-tertiary" aria-label={dict.linkArrow} />
                <EntityChip type={effect.toType} dict={dict} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {explanation.moneySafe && (
        <p className="flex items-start gap-1.5 rounded-(--neu-radius-md) bg-surface-sunken/60 px-2 py-1.5 text-text-secondary">
          <ShieldCheckIcon size={13} strokeWidth={1.75} className="mt-px shrink-0 text-text-tertiary" />
          {dict.moneySafe}
        </p>
      )}

      {explanation.unsupported && (
        <p className="flex items-start gap-1.5 rounded-(--neu-radius-md) bg-accent-yellow/15 px-2 py-1.5 text-text-primary" role="alert">
          <AlertTriangleIcon size={13} strokeWidth={1.75} className="mt-px shrink-0" />
          {dict.unsupported}
        </p>
      )}

      {!explanation.unsupported && <p className="text-text-tertiary">{dict.confirmHint}</p>}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">{label}</p>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

/** Falls back to the raw type so an unmapped entity reads oddly, never blank. */
function EntityChip({ type, dict }: { type: string; dict: Dictionary["inbox"]["draft"] }) {
  const label = dict.entities[type as keyof typeof dict.entities] ?? type;
  return (
    <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium text-text-secondary">{label}</span>
  );
}

function originText(origin: Explanation["origin"], dict: Dictionary["inbox"]["draft"]): string {
  switch (origin.kind) {
    case "ai_detection":
      return origin.intent ? `${dict.whyAi}: ${origin.intent}` : dict.whyAi;
    case "source_entity": {
      const source = dict.sources[origin.sourceType as keyof typeof dict.sources] ?? origin.sourceType;
      return origin.label ? `${dict.whySource} ${source} — ${origin.label}` : `${dict.whySource} ${source}`;
    }
    case "manual_capture":
      return dict.whyManual;
  }
}

function changeText(effect: Exclude<DraftEffect, { kind: "link" }>, dict: Dictionary["inbox"]["draft"]): string {
  if (effect.kind === "no_new_data") return dict.noNewData;

  switch (effect.entityType) {
    case "task":
      return dict.willCreateTask;
    case "financial_task":
      return dict.willCreateFinancialTask;
    case "action_item":
      return dict.willCreateActionItem;
  }
}
