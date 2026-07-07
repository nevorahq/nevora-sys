import { cache } from "react";
import { redirect } from "next/navigation";
import { requireUser } from "./require-user";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/shared/config/routes";
import { resolveActiveOrganizationId, type MembershipRecord } from "./resolve-active-organization";
import { getSelectedOrganizationId, setSelectedOrganizationId } from "./organization-cookie";
import type {
  CurrentContext,
  OrgContext,
  WorkspaceContext,
  RoleContext,
  MembershipContext,
} from "@/lib/context/current-context";
import type { OrgRole } from "@/lib/context/organization-context";

// Permissions derived from role — no separate DB table needed.
// Matches RBAC model from 002_security_functions.sql.
//
// Automation Foundation (Phase 1) permissions — derived from role, same model:
//   domain_event.read  — читать журнал бизнес-событий
//   entity_link.*      — управлять кросс-модульными связями
//   automation.read    — читать automation_audit_logs
//   automation.manage  — управлять автоматизациями (зарезервировано на будущее)
// Связи создаются writer-ролями, удаляются manager+ — зеркалит
// can_write_data()/can_delete_data() из 002_security_functions.sql.
//
// Action Center (Phase 3) permissions — derived from role, same model:
//   action_center.view              — открыть Action Center
//   action_center.manage            — административное управление item'ами
//   action_center.assign            — назначать ответственного
//   action_center.resolve/.dismiss  — закрывать/отклонять (+ snooze под resolve)
//   action_center.execute           — safe quick actions
//   action_center.execute.financial / .subscription / .document_approval
//                                   — sensitive executes (требуют confirmation)
// Финансовый execute — только owner/admin. Members получают только safe-набор.
// Capture Inbox (Phase 8) permissions — derived from role, same model:
//   planner.entry.create/read/update/delete       — capture + manage raw entries
//   planner.suggestion.read/accept/edit/reject     — review AI suggestions
// Capture is a core member action, so members get the full capture+review set
// (accept still additionally requires the target-entity permission, e.g.
// data.write for a task). The inbox is a private, owner-scoped surface
// (migration 087: RLS restricts every row to owner_user_id = auth.uid()), so
// delete is safe for members too — they can only ever archive their OWN captures.
const PLANNER_WRITER = ["planner.entry.create", "planner.entry.read", "planner.entry.update", "planner.entry.delete", "planner.suggestion.read", "planner.suggestion.accept", "planner.suggestion.edit", "planner.suggestion.reject"];
const PLANNER_MANAGER = [...PLANNER_WRITER];

const ROLE_PERMISSIONS: Record<OrgRole, string[]> = {
  owner:   ["org.read", "org.update", "org.delete", "users.manage", "billing.manage", "plans.view", "usage.view", "developer.view", "developer.manage", "api_key.create", "api_key.revoke", "webhook.create", "webhook.update", "webhook.delete", "workspace.manage", "data.write", "data.delete", "domain_event.read", "entity_link.read", "entity_link.create", "entity_link.delete", "automation.read", "automation.manage", "action_center.view", "action_center.manage", "action_center.assign", "action_center.resolve", "action_center.dismiss", "action_center.execute", "action_center.execute.financial", "action_center.execute.subscription", "action_center.execute.document_approval", ...PLANNER_MANAGER],
  admin:   ["org.read", "org.update", "users.manage", "billing.manage", "plans.view", "usage.view", "developer.view", "developer.manage", "api_key.create", "api_key.revoke", "webhook.create", "webhook.update", "webhook.delete", "workspace.manage", "data.write", "data.delete", "domain_event.read", "entity_link.read", "entity_link.create", "entity_link.delete", "automation.read", "automation.manage", "action_center.view", "action_center.manage", "action_center.assign", "action_center.resolve", "action_center.dismiss", "action_center.execute", "action_center.execute.financial", "action_center.execute.subscription", "action_center.execute.document_approval", ...PLANNER_MANAGER],
  manager: ["org.read", "plans.view", "usage.view", "developer.view", "data.write", "data.delete", "domain_event.read", "entity_link.read", "entity_link.create", "entity_link.delete", "automation.read", "action_center.view", "action_center.manage", "action_center.assign", "action_center.resolve", "action_center.dismiss", "action_center.execute", "action_center.execute.subscription", "action_center.execute.document_approval", ...PLANNER_MANAGER],
  member:  ["org.read", "plans.view", "usage.view", "developer.view", "data.write", "domain_event.read", "entity_link.read", "entity_link.create", "automation.read", "action_center.view", "action_center.resolve", "action_center.dismiss", "action_center.execute", ...PLANNER_WRITER],
};

/**
 * Требовать активный org + workspace контекст — или redirect.
 *
 * Обёрнут в React cache() — дедупликация в рамках одного render pass.
 * Layout и Page могут оба вызвать requireOrg() — только один DB-запрос.
 *
 * Phase 2 schema: memberships (role as TEXT) + organizations + workspaces.
 * Permissions derived from role — no role_permissions table needed.
 *
 * Multi-org: пользователь может состоять в нескольких организациях
 * (active membership в каждой). Активная — та, что выбрана через
 * active_org_id cookie (см. organization-cookie.ts), если она реально
 * принадлежит пользователю (resolveActiveOrganizationId никогда не
 * доверяет cookie напрямую — только как подсказку). Иначе — детерминированный
 * fallback на старейшее active membership, как и раньше для single-org.
 */
export const requireOrg = cache(async (): Promise<CurrentContext> => {
  const user = await requireUser();
  const supabase = await createClient();

  // ── 1. Все active membership пользователя + Organization ───────────────
  const { data: membershipRows, error: memberError } = await supabase
    .from("memberships")
    .select(
      `
      id,
      organization_id,
      user_id,
      role,
      status,
      created_at,
      organizations (
        id,
        name,
        slug,
        plan,
        base_currency
      )
    `,
    )
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (memberError || !membershipRows || membershipRows.length === 0) {
    redirect(ROUTES.onboarding);
  }

  const selectedOrganizationId = await getSelectedOrganizationId();
  const records: MembershipRecord[] = membershipRows.map((row) => ({
    organizationId: row.organization_id as string,
    status: row.status as MembershipRecord["status"],
    createdAt: row.created_at as string,
  }));
  const activeOrganizationId = resolveActiveOrganizationId(records, selectedOrganizationId);

  const memberData = membershipRows.find((row) => row.organization_id === activeOrganizationId);
  if (!memberData) {
    // Не должно случиться (records строятся из тех же строк), но fail closed.
    redirect(ROUTES.onboarding);
  }

  // Cookie отсутствовала/указывала на недоступную org — обновить best-effort
  // (no-op при вызове из Server Component render, см. organization-cookie.ts).
  const resolvedOrganizationId = memberData.organization_id as string;
  if (selectedOrganizationId !== resolvedOrganizationId) {
    await setSelectedOrganizationId(resolvedOrganizationId);
  }

  const rawOrg = Array.isArray(memberData.organizations)
    ? memberData.organizations[0]
    : memberData.organizations;

  if (!rawOrg) {
    redirect(ROUTES.onboarding);
  }

  const org: OrgContext = {
    id: rawOrg.id as string,
    name: rawOrg.name as string,
    slug: (rawOrg.slug as string | null) ?? "",
    plan: rawOrg.plan as string,
    logoUrl: null,
    baseCurrency: (rawOrg.base_currency as string | null) ?? "EUR",
  };

  const roleName = memberData.role as OrgRole;

  const role: RoleContext = {
    id: roleName,
    name: roleName,
    isSystem: true,
    organizationId: org.id,
  };

  const membership: MembershipContext = {
    id: memberData.id as string,
    organizationId: memberData.organization_id as string,
    userId: memberData.user_id as string,
    roleId: roleName,
    status: memberData.status as MembershipContext["status"],
    joinedAt: (memberData.created_at as string | null) ?? null,
  };

  // ── 2. Permissions ────────────────────────────────────────────────────
  const permissions = new Set<string>(ROLE_PERMISSIONS[roleName] ?? []);

  // ── 3. Workspace ──────────────────────────────────────────────────────
  const { data: wsData } = await supabase
    .from("workspaces")
    .select("id, name")
    .eq("organization_id", org.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (!wsData) {
    redirect(ROUTES.onboarding);
  }

  const workspace: WorkspaceContext = {
    id: wsData.id as string,
    name: wsData.name as string,
    slug: "",
    description: null,
  };

  return { user, org, membership, role, permissions, workspace };
});
