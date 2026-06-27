/**
 * Minimal structured logger (dependency-free).
 *
 * Emits one JSON object per line so logs are queryable in any aggregator
 * (Vercel, Datadog, Logflare) instead of free-form `console.log` strings.
 * Levels map to the matching console method so existing log drains keep working.
 *
 * Usage:
 *   import { logger } from "@/lib/observability/logger";
 *   logger.info("extraction.done", { documentId, status });
 *   const log = logger.child({ scope: "extraction", documentId });
 *   log.error("persist.failed", { error: err.message });
 */
export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
  /** Returns a logger that merges `base` fields into every entry. */
  child(base: LogFields): Logger;
}

function emit(level: LogLevel, base: LogFields, event: string, fields?: LogFields): void {
  const entry = { level, event, time: new Date().toISOString(), ...base, ...fields };
  let line: string;
  try {
    line = JSON.stringify(entry);
  } catch {
    // Circular/unserializable field — fall back to a safe shape.
    line = JSON.stringify({ level, event, time: entry.time, note: "unserializable fields" });
  }
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

function make(base: LogFields): Logger {
  return {
    debug: (event, fields) => emit("debug", base, event, fields),
    info: (event, fields) => emit("info", base, event, fields),
    warn: (event, fields) => emit("warn", base, event, fields),
    error: (event, fields) => emit("error", base, event, fields),
    child: (extra) => make({ ...base, ...extra }),
  };
}

export const logger: Logger = make({});
