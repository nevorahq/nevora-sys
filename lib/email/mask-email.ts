/**
 * Redacts an email for audit logs / domain events / application logs.
 *
 * Security principle (see docs/security/SECURITY_CONTROL_PLANE_AUDIT.md):
 * raw email must never be persisted in audit_logs, domain_events or logs.
 * The local part carries the personal identifier, so we obscure it and keep
 * only the first character + domain — enough for support triage, not a
 * deliverable/raw address.
 *
 *   "Jane.Doe@Example.com" → "j***@example.com"
 *   "a@x.io"               → "a***@x.io"
 *   null / "" / malformed  → null / "***"
 */
export function maskEmail(email: string | null | undefined): string | null {
  if (email == null) return null;
  const trimmed = email.trim().toLowerCase();
  if (trimmed === "") return null;

  const at = trimmed.lastIndexOf("@");
  // No local part or no "@" at all → nothing safe to show.
  if (at <= 0 || at === trimmed.length - 1) return "***";

  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  return `${local[0]}***@${domain}`;
}
