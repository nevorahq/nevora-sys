import "server-only";

import { logger, type LogFields } from "./logger";
import { getMonitoring } from "./monitoring";

/**
 * Centralized server-side error reporting (Phase 7.5).
 *
 * Logs a failure as a structured event AND returns a user-safe payload:
 *   - a short `diagnosticId` the user can quote to support, and
 *   - a friendly `message` that never contains the raw error or a stack trace.
 *
 * Usage (server action / route handler):
 *   } catch (err) {
 *     const { diagnosticId, message } = reportError("documents.upload.failed", err, {
 *       userMessage: "We could not finish the upload. Please try again.",
 *       fields: { organizationId: org.id },
 *     });
 *     return NextResponse.json({ error: message, diagnosticId }, { status: 500 });
 *   }
 *
 * Client error boundaries can't use this (it is server-only). They should render
 * friendly copy plus Next's `error.digest`, which correlates to the server log.
 */
export interface ReportedError {
  /** Short id echoed to the user and attached to the log line for correlation. */
  diagnosticId: string;
  /** User-safe message. Safe to render in the UI. */
  message: string;
}

const DEFAULT_USER_MESSAGE = "Something went wrong on our side. Please try again.";

/** Non-cryptographic short id — only needs to be unique enough to grep a log. */
function newDiagnosticId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function reportError(
  event: string,
  error: unknown,
  opts?: { userMessage?: string; fields?: LogFields },
): ReportedError {
  const diagnosticId = newDiagnosticId();

  logger.error(event, {
    diagnosticId,
    error: error instanceof Error ? error.message : String(error),
    ...(error instanceof Error && error.stack ? { stack: error.stack } : {}),
    ...opts?.fields,
  });

  // Second destination: the external error monitor (no-op until a DSN + adapter
  // are installed — see docs/observability/sentry-setup.md). This is the "caught"
  // lane; uncaught errors reach the same seam via `onRequestError` in
  // instrumentation.ts. The seam never throws, so it is safe inside a catch.
  getMonitoring().captureException(error, {
    event,
    diagnosticId,
    fields: opts?.fields,
  });

  return {
    diagnosticId,
    message: opts?.userMessage ?? DEFAULT_USER_MESSAGE,
  };
}
