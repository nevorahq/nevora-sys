/**
 * Audit Log Types — Nevora Business OS
 */

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "restore"
  | "assign"
  | "unassign"
  | "role_change"
  | "permission_change"
  | "status_change"
  | "stage_change"
  | "billing_change"
  | "invite"
  | "suspend";

export interface AuditLog {
  id: string;
  organization_id: string;
  user_id: string;
  entity_type: string;
  entity_id: string;
  action: AuditAction;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  metadata: AuditLogMetadata;
  created_at: string;
}

export interface AuditLogMetadata {
  source?: "dashboard" | "api" | "automation" | "system";
  ip_address?: string;
  user_agent?: string;
  [key: string]: unknown;
}

export interface EmitAuditLogParams {
  organizationId: string;
  entityType: string;
  entityId: string;
  action: AuditAction;
  oldData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
  metadata?: AuditLogMetadata;
}
