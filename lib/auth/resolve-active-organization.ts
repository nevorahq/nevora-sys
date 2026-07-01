/**
 * Чистая логика выбора активной организации из мультиорг-membership.
 *
 * Вынесена из requireOrg(), чтобы быть тестируемой без Supabase/cookies/redirect.
 * requireOrg() отвечает за I/O (запрос к БД, чтение cookie), эта функция —
 * только за решение "какая организация активна", если пользователь состоит
 * в нескольких.
 */

export type MembershipStatus = "active" | "invited" | "suspended";

export interface MembershipRecord {
  organizationId: string;
  status: MembershipStatus;
  /** ISO timestamp — используется для детерминированного fallback (старейшее членство). */
  createdAt: string;
}

/**
 * Резолвит id активной организации.
 *
 * Правила:
 *   1. Только membership со status === "active" рассматриваются — invited/
 *      suspended никогда не становятся активной организацией, даже если их id
 *      совпадает с selectedOrganizationId (defense in depth: то же самое уже
 *      гарантирует SQL-запрос в requireOrg(), но резолвер не доверяет входу).
 *   2. Если selectedOrganizationId указывает на активное membership — берём его.
 *   3. Иначе — детерминированный fallback: старейшее активное membership
 *      (по createdAt), чтобы поведение совпадало с прежним requireOrg().
 *   4. Нет ни одного активного membership → null (вызывающая сторона решает,
 *      что делать — сейчас redirect на onboarding).
 */
export function resolveActiveOrganizationId(
  memberships: MembershipRecord[],
  selectedOrganizationId: string | null | undefined,
): string | null {
  const active = memberships.filter((m) => m.status === "active");
  if (active.length === 0) return null;

  if (selectedOrganizationId) {
    const selected = active.find((m) => m.organizationId === selectedOrganizationId);
    if (selected) return selected.organizationId;
  }

  const oldestFirst = [...active].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return oldestFirst[0].organizationId;
}
