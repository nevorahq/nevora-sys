import "server-only";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { PLANNER_RAW_TEXT_MAX_LENGTH } from "../schemas/planner-entry.schema";
import type { PlannerErrorCode } from "../types/planner.types";

export type InboxErrors = Dictionary["inbox"]["errors"];
type ActionFailureKey = "acceptFailed" | "rejectFailed" | "editFailed" | "captureFailed";

export async function getInboxErrors(): Promise<InboxErrors> {
  return (await getDictionary()).dict.inbox.errors;
}

/**
 * The viewer-language message for a planner service failure. A generic
 * `failed` reads as the action that failed ("Couldn't accept …").
 */
export function messageForCode(errors: InboxErrors, code: PlannerErrorCode, onFailed: ActionFailureKey): string {
  switch (code) {
    case "forbidden":
      return errors.forbidden;
    case "not_found":
      return errors.notFound;
    case "not_open":
      return errors.notOpen;
    case "busy":
      return errors.busy;
    case "invalid":
      return errors.invalid;
    case "unsupported":
      return errors.unsupported;
    case "partial":
      return errors.partial;
    case "task_failed":
      return errors.taskFailed;
    case "empty":
      return errors.empty;
    case "failed":
      return errors[onFailed];
  }
}

/** Field errors for a capture's text, in the viewer's language. */
export function rawTextFieldErrors(
  errors: InboxErrors,
  issues: readonly { path: readonly PropertyKey[]; code: string }[],
): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "_form");
    const message =
      key !== "rawText"
        ? errors.invalid
        : issue.code === "too_big"
          ? errors.tooLong.replace("{max}", String(PLANNER_RAW_TEXT_MAX_LENGTH))
          : errors.empty;
    fieldErrors[key] = [...(fieldErrors[key] ?? []), message];
  }
  return fieldErrors;
}
