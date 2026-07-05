/**
 * Extract the useful fields from a Postgres / PostgREST error into a PLAIN object.
 *
 * Why this exists: a supabase-js `PostgrestError` is an `Error` subclass, so its
 * `message`/`stack` are non-enumerable. Logging it with a raw
 * `console.error("...", error)` can serialize to `{}` in some log drains, hiding
 * the real cause (this is exactly how a 42703 trigger bug hid behind
 * "deleteDocument error: {}"). Passing the result of this function to the
 * structured logger guarantees `code`/`message`/`details`/`hint` are visible.
 */
export interface PgErrorInfo {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

export function describePgError(error: unknown): PgErrorInfo {
  if (error === null || error === undefined) return {};
  if (typeof error === "string") return { message: error };
  if (typeof error !== "object") return { message: String(error) };

  const e = error as Record<string, unknown>;
  const info: PgErrorInfo = {};
  if (typeof e.code === "string") info.code = e.code;
  if (typeof e.message === "string") info.message = e.message;
  if (typeof e.details === "string") info.details = e.details;
  if (typeof e.hint === "string") info.hint = e.hint;

  // Plain Error (or anything with a non-enumerable message) still surfaces here.
  if (info.message === undefined && error instanceof Error) info.message = error.message;
  return info;
}
