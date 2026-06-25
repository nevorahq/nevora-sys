import type {
  ActionItemPriority,
  ActionItemType,
  ActionSourceType,
} from "../types/action-item.types";

/**
 * Priority Engine (Phase 3 §13) — чистая функция.
 *
 * Считает priority_score (0..100) из бизнес-факторов и мапит в enum.
 * Server-side только: фронт никогда не считает приоритет.
 */

export interface PriorityInput {
  type: ActionItemType;
  sourceType: ActionSourceType;
  /** ISO дата срока или null. */
  dueAt?: string | null;
  /** Денежное влияние (абс. величина), если применимо. */
  financialImpact?: number | null;
  /** Уверенность AI 0..1, если ai_generated. */
  aiConfidence?: number | null;
  /** Сигнал об отсутствующей связи (missing relation). */
  missingRelation?: boolean;
  /** Ручной override приоритета (имеет высший приоритет). */
  manualOverride?: ActionItemPriority;
  /** «Сейчас» — для тестируемости. */
  now?: Date;
}

export interface PriorityResult {
  score: number;
  priority: ActionItemPriority;
}

const FINANCIAL_THRESHOLD = 100;
const CRITICAL_SOURCES: ActionSourceType[] = ["transaction", "subscription", "crm"];

// Базовый вклад по типу — насколько сигнал «горячий» сам по себе.
const TYPE_BASE: Record<ActionItemType, number> = {
  overdue: 35,
  payment_required: 35,
  risk_detected: 30,
  approval_required: 25,
  renewal_required: 25,
  due_soon: 20,
  draft_review: 18,
  document_review: 18,
  follow_up_required: 18,
  missing_relation: 12,
  missing_information: 12,
  assignment_required: 10,
  ai_suggestion: 8,
};

const SCORE_FOR_PRIORITY: Record<ActionItemPriority, number> = {
  critical: 95,
  high: 80,
  medium: 55,
  low: 25,
  info: 5,
};

export function computePriority(input: PriorityInput): PriorityResult {
  if (input.manualOverride) {
    return { score: SCORE_FOR_PRIORITY[input.manualOverride], priority: input.manualOverride };
  }

  const now = input.now ?? new Date();
  let score = TYPE_BASE[input.type] ?? 10;

  // Срок / просрочка
  if (input.dueAt) {
    const due = new Date(input.dueAt).getTime();
    const diffMs = due - now.getTime();
    const hours = diffMs / (1000 * 60 * 60);
    if (diffMs < 0) score += 30; // overdue
    else if (hours <= 24) score += 20; // due within 24h
    else if (hours <= 72) score += 10; // due within 72h
  }

  // Денежное влияние
  if (typeof input.financialImpact === "number" && Math.abs(input.financialImpact) > FINANCIAL_THRESHOLD) {
    score += 25;
  }

  // AI confidence
  if (typeof input.aiConfidence === "number" && input.aiConfidence > 0.8) {
    score += 10;
  }

  // Отсутствующая связь
  if (input.missingRelation) score += 10;

  // Критичный источник
  if (CRITICAL_SOURCES.includes(input.sourceType)) score += 10;

  score = clamp(score, 0, 100);
  return { score, priority: mapPriority(score) };
}

export function mapPriority(score: number): ActionItemPriority {
  if (score >= 90) return "critical";
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  if (score >= 10) return "low";
  return "info";
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
