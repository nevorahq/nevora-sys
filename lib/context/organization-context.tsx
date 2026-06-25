"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import type { OrgContext, MembershipContext } from "./current-context";

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

export type OrgRole = "owner" | "admin" | "manager" | "member";

export interface OrganizationContextValue {
  organization: OrgContext;
  membership: MembershipContext;
  role: OrgRole;
}

// -----------------------------------------------------------------------
// Context
// -----------------------------------------------------------------------

const OrganizationContext = createContext<OrganizationContextValue | null>(null);

// -----------------------------------------------------------------------
// Provider
// -----------------------------------------------------------------------
// Используется в Server Component (dashboard layout) — данные загружаются
// на сервере, передаются как props в клиентский провайдер.
// Это позволяет избежать waterfall запросов на клиенте.

interface OrganizationProviderProps {
  value: OrganizationContextValue;
  children: ReactNode;
}

export function OrganizationProvider({ value, children }: OrganizationProviderProps) {
  return (
    <OrganizationContext.Provider value={value}>
      {children}
    </OrganizationContext.Provider>
  );
}

// -----------------------------------------------------------------------
// Hooks
// -----------------------------------------------------------------------

/**
 * Текущая организация. Бросает если используется вне OrganizationProvider.
 */
export function useCurrentOrganization(): OrgContext {
  const ctx = useContext(OrganizationContext);
  if (!ctx) {
    throw new Error("useCurrentOrganization must be used within OrganizationProvider");
  }
  return ctx.organization;
}

/**
 * Роль текущего пользователя в организации.
 */
export function useMembershipRole(): OrgRole {
  const ctx = useContext(OrganizationContext);
  if (!ctx) {
    throw new Error("useMembershipRole must be used within OrganizationProvider");
  }
  return ctx.role;
}

/**
 * Полный контекст организации + членства.
 */
export function useOrganizationContext(): OrganizationContextValue {
  const ctx = useContext(OrganizationContext);
  if (!ctx) {
    throw new Error("useOrganizationContext must be used within OrganizationProvider");
  }
  return ctx;
}

// -----------------------------------------------------------------------
// RBAC helpers (клиентская сторона)
// -----------------------------------------------------------------------
// Используй для UI-логики (скрыть кнопку, показать badge).
// НЕ используй для server-side authorization — там используй
// security functions из PostgreSQL или requireContext().

const ROLE_WEIGHT: Record<OrgRole, number> = {
  owner: 40,
  admin: 30,
  manager: 20,
  member: 10,
};

/**
 * Проверить, что роль пользователя >= минимальной требуемой роли.
 */
export function useHasRole(minRole: OrgRole): boolean {
  const { role } = useOrganizationContext();
  return ROLE_WEIGHT[role] >= ROLE_WEIGHT[minRole];
}

export function useCanManageUsers(): boolean {
  return useHasRole("admin");
}

export function useCanManageBilling(): boolean {
  return useHasRole("owner");
}

export function useCanManageWorkspace(): boolean {
  return useHasRole("admin");
}

export function useCanWriteData(): boolean {
  return useHasRole("member");
}

export function useCanDeleteData(): boolean {
  return useHasRole("manager");
}
