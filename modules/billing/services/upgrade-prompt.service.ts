import type { PlanSlug } from "../constants/billing.constants";
import {
  commercialPlanCatalog,
  nextCommercialPlanKey,
  planKeyForSlug,
} from "../plan-catalog";
import type { CommercialPlanKey } from "../plan-catalog.schema";

export interface UpgradePromptUsageInput {
  key: string;
  label: string;
  used: number;
  limit: number | null;
  unit?: string;
}

export interface UpgradePromptModel {
  id: string;
  severity: "warning" | "blocked";
  metricKey: string;
  title: string;
  message: string;
  usageText: string;
  valueText: string;
  targetPlanKey: CommercialPlanKey;
  targetPlanSlug: PlanSlug;
}

function usageText(input: UpgradePromptUsageInput): string {
  const unit = input.unit ? ` ${input.unit}` : "";
  return `${input.used}${unit} / ${input.limit === null ? "unlimited" : `${input.limit}${unit}`}`;
}

function metricTitle(input: UpgradePromptUsageInput, blocked: boolean): string {
  if (input.key.includes("document")) return blocked ? "Document processing limit reached" : "Document processing is close to its limit";
  if (input.key.includes("ai")) return blocked ? "AI suggestions limit reached" : "AI suggestions are close to their limit";
  if (input.key.includes("member")) return blocked ? "Team member limit reached" : "Team member seats are close to their limit";
  if (input.key.includes("storage")) return blocked ? "Storage limit reached" : "Storage is close to its limit";
  if (input.key.includes("automation")) return blocked ? "Automation run limit reached" : "Automation runs are close to their limit";
  return blocked ? `${input.label} limit reached` : `${input.label} is close to its limit`;
}

export function getUpgradePromptForUsage(
  input: UpgradePromptUsageInput,
  currentPlanSlug: PlanSlug | string | null | undefined,
): UpgradePromptModel | null {
  if (input.limit === null || input.limit <= 0) return null;

  const percent = input.used / input.limit;
  if (percent < 0.8) return null;

  const currentPlanKey = planKeyForSlug(currentPlanSlug);
  const targetPlanKey = nextCommercialPlanKey(currentPlanKey);
  const targetPlan = commercialPlanCatalog[targetPlanKey];
  const blocked = input.used >= input.limit;

  return {
    id: `${input.key}:${blocked ? "blocked" : "warning"}`,
    severity: blocked ? "blocked" : "warning",
    metricKey: input.key,
    title: metricTitle(input, blocked),
    message: blocked
      ? `${input.label} is blocked because the current plan limit has been used.`
      : `${input.label} is nearing the current plan limit.`,
    usageText: usageText(input),
    valueText: targetPlan.upgradeValue,
    targetPlanKey,
    targetPlanSlug: targetPlan.planSlug,
  };
}

export function getUpgradePromptsForUsage(
  usage: UpgradePromptUsageInput[],
  currentPlanSlug: PlanSlug | string | null | undefined,
): UpgradePromptModel[] {
  return usage
    .map((item) => getUpgradePromptForUsage(item, currentPlanSlug))
    .filter((item): item is UpgradePromptModel => item !== null)
    .slice(0, 5);
}
