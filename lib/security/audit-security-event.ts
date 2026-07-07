import "server-only";

import { maskEmail } from "@/lib/email";
import type { AccessErrorCode } from "./access-errors";
import type { AccessIntent } from "./entitlements";

/**
 * Security-event sink for authorization decisions (Phase 2).
 *
 * There is no dedicated `security_events` table — migration 089 folds security
 * telemetry into `domain_events` / audit logs. For a *denied* access there is
 * no target entity to audit, so this helper emits a structured, PII-free
 * application-log line instead. It is the single place the gate records "who
 * was refused what and why", and it must never throw (a logging failure must
 * not turn a clean denial into a 500).
 *
 * Invariant: NEVER log a raw email or other PII. Actor identity is a masked
 * email (falling back to the opaque user id), matching the masking already
 * applied at domain-event / audit sinks (migration 090).
 */
export interface SecurityEventInput {
  /** What happened. `access_denied` is the gate's default. */
  action: "access_denied" | "tenant_mismatch" | "permission_denied" | "entitlement_denied";
  /** Typed reason code the gate raised. */
  code: AccessErrorCode;
  userId?: string | null;
  userEmail?: string | null;
  organizationId?: string | null;
  workspaceId?: string | null;
  permission?: string | null;
  intent?: AccessIntent | null;
  /** Extra non-PII context (e.g. requested vs active org id). */
  metadata?: Record<string, unknown>;
}

export function auditSecurityEvent(input: SecurityEventInput): void {
  try {
    // Masked actor: prefer masked email, else the opaque uid, else "anonymous".
    const actor = input.userEmail
      ? maskEmail(input.userEmail)
      : input.userId ?? "anonymous";

    console.warn("[security]", {
      action: input.action,
      code: input.code,
      actor,
      organizationId: input.organizationId ?? null,
      workspaceId: input.workspaceId ?? null,
      permission: input.permission ?? null,
      intent: input.intent ?? null,
      ...(input.metadata ? { metadata: input.metadata } : {}),
    });
  } catch {
    // Never let telemetry break the request.
  }
}
