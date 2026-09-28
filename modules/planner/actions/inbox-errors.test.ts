import { describe, expect, it } from "vitest";
import { en } from "@/shared/i18n/dictionaries/en";
import { ru } from "@/shared/i18n/dictionaries/ru";
import { ro } from "@/shared/i18n/dictionaries/ro";
import { messageForCode, rawTextFieldErrors } from "./inbox-errors";
import type { PlannerErrorCode } from "../types/planner.types";

const CODES: PlannerErrorCode[] = [
  "forbidden",
  "not_found",
  "not_open",
  "busy",
  "invalid",
  "unsupported",
  "failed",
  "partial",
  "empty",
  "task_failed",
];

describe("inbox action errors", () => {
  it("gives every failure code a message in every language", () => {
    for (const dict of [en, ru, ro]) {
      for (const code of CODES) {
        expect(messageForCode(dict.inbox.errors, code, "acceptFailed")).toBeTruthy();
      }
    }
  });

  it("reads a generic failure as the action that failed", () => {
    expect(messageForCode(ru.inbox.errors, "failed", "acceptFailed")).toBe("Не удалось принять предложение. Попробуйте ещё раз.");
    expect(messageForCode(ru.inbox.errors, "failed", "rejectFailed")).toBe("Не удалось отклонить предложение. Попробуйте ещё раз.");
    expect(messageForCode(ro.inbox.errors, "not_open", "editFailed")).toBe("Această sugestie a fost deja procesată.");
  });

  it("localizes capture text errors by kind", () => {
    expect(rawTextFieldErrors(ru.inbox.errors, [{ path: ["rawText"], code: "too_small" }])).toEqual({
      rawText: ["Напишите что-нибудь, чтобы добавить."],
    });
    expect(rawTextFieldErrors(ru.inbox.errors, [{ path: ["rawText"], code: "too_big" }])).toEqual({
      rawText: ["Не длиннее 4000 символов."],
    });
    expect(rawTextFieldErrors(en.inbox.errors, [{ path: ["entryId"], code: "invalid_format" }])).toEqual({
      entryId: [en.inbox.errors.invalid],
    });
  });
});
