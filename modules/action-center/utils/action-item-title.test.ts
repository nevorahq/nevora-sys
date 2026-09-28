import { describe, expect, it } from "vitest";
import { en } from "@/shared/i18n/dictionaries/en";
import { ru } from "@/shared/i18n/dictionaries/ru";
import { ro } from "@/shared/i18n/dictionaries/ro";
import { actionItemTitle, localizeActionItemTitle, type ActionItemTitleKey } from "./action-item-title";

const KEYS = Object.keys(en.actionCenter.titles) as ActionItemTitleKey[];

describe("action item titles", () => {
  it("keeps the stored English format that existing rows already use", () => {
    expect(actionItemTitle("overdueTask", "Call the bank")).toBe("Overdue task: Call the bank");
    expect(actionItemTitle("documentExtractionFailed")).toBe("Document extraction failed");
    expect(actionItemTitle("deletedTask", "x".repeat(300))).toHaveLength(200);
  });

  it.each(KEYS)("round-trips %s into every language", (key) => {
    const stored = actionItemTitle(key, "Acme");
    for (const dict of [en, ru, ro]) {
      expect(localizeActionItemTitle(stored, dict.actionCenter.titles)).toBe(
        dict.actionCenter.titles[key].replace("{name}", "Acme"),
      );
    }
  });

  it("prefers the most specific template", () => {
    const titles = ru.actionCenter.titles;
    expect(localizeActionItemTitle("Review capture: Позвонить", titles)).toBe("Проверьте запись: Позвонить");
    expect(localizeActionItemTitle("Review document extraction: scan.pdf", titles)).toBe(
      "Проверьте распознавание документа: scan.pdf",
    );
    expect(localizeActionItemTitle("Review document extraction", titles)).toBe("Проверьте распознавание документа");
  });

  it("leaves a title that is not a system template untouched", () => {
    expect(localizeActionItemTitle("Позвонить бухгалтеру", ru.actionCenter.titles)).toBe("Позвонить бухгалтеру");
    expect(localizeActionItemTitle("Overdue task: ", ru.actionCenter.titles)).toBe("Overdue task: ");
  });

  it("gives every template the same placeholder in every language", () => {
    for (const key of KEYS) {
      const hasName = en.actionCenter.titles[key].includes("{name}");
      expect(ru.actionCenter.titles[key].includes("{name}")).toBe(hasName);
      expect(ro.actionCenter.titles[key].includes("{name}")).toBe(hasName);
    }
  });
});
