import type { User } from "@supabase/supabase-js";

/**
 * Контекст текущей организации.
 * Соответствует колонкам таблицы public.organizations.
 */
export interface OrgContext {
  id: string;
  name: string;
  slug: string;
  plan: string;
  logoUrl: string | null;
  /** Базовая валюта отчётности (ISO 4217). К ней приводятся кросс-валютные итоги. */
  baseCurrency: string;
}

/**
 * Контекст workspace, в котором работает пользователь.
 * Соответствует колонкам таблицы public.workspaces.
 */
export interface WorkspaceContext {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

/**
 * Контекст роли пользователя в организации.
 * Системные роли (lowercase, как в БД): owner, admin, manager, member.
 * Кастомные: organization_id IS NOT NULL.
 */
export interface RoleContext {
  id: string;
  name: string;
  isSystem: boolean;
  organizationId: string | null;
}

/**
 * Контекст членства пользователя в организации.
 * Один пользователь — одно активное членство на организацию.
 */
export interface MembershipContext {
  id: string;
  organizationId: string;
  userId: string;
  roleId: string;
  status: "invited" | "active" | "suspended";
  joinedAt: string | null;
}

/**
 * Полный контекст текущего запроса.
 *
 * Получается через requireContext() в Server Actions и Server Components.
 * Становится единым источником данных для:
 *   - RBAC: permissions проверяются здесь, не в каждом action отдельно
 *   - Org isolation: все запросы к БД используют org.id из этого контекста
 *   - AI Assistant: передаёт полный контекст для персонализации
 *   - Automation Engine: знает, кто и в какой org выполняет action
 *   - Analytics: для корректной аттрибуции событий
 *   - CRM: scope запросов по org + workspace
 *
 * Не хранится в сессии/cookies (stateless).
 * Пересоздаётся на каждый запрос через React cache() для дедупликации.
 */
export interface CurrentContext {
  user: User;
  org: OrgContext;
  membership: MembershipContext;
  role: RoleContext;
  permissions: ReadonlySet<string>;
  workspace: WorkspaceContext;
}

/**
 * Проверить наличие разрешения в контексте.
 *
 * Использование:
 *   const ctx = await requireContext();
 *   if (!canDo(ctx, 'todos.write')) throw new Error('Forbidden');
 *
 * Не делать запрос к БД — разрешения уже загружены в контекст.
 */
export function canDo(ctx: CurrentContext, permission: string): boolean {
  return ctx.permissions.has(permission);
}

/**
 * Проверить, является ли пользователь владельцем организации.
 *
 * Роли в БД (memberships.role) хранятся в lowercase: owner/admin/manager/member.
 */
export function isOwner(ctx: CurrentContext): boolean {
  return ctx.role.name === "owner" && ctx.role.isSystem;
}

/**
 * Проверить, является ли пользователь администратором (owner или admin).
 */
export function isAdmin(ctx: CurrentContext): boolean {
  return (
    ctx.role.isSystem &&
    (ctx.role.name === "owner" || ctx.role.name === "admin")
  );
}
