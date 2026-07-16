import { describe, expect, it } from "vitest";
import { en } from "@/shared/i18n/dictionaries/en";
import { ru } from "@/shared/i18n/dictionaries/ru";
import { ro } from "@/shared/i18n/dictionaries/ro";

function leafKeys(value: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === "object"
      ? leafKeys(child as Record<string, unknown>, path)
      : [path];
  }).sort();
}

describe("Money FX translations", () => {
  it("keeps EN/RU/RO exchange-rate and transfer keys structurally complete", () => {
    const english = leafKeys({
      exchangeRates: en.money.exchangeRates,
      transfer: en.money.transfer,
      transferRateMissing: en.money.errors.transferRateMissing,
    });

    for (const dictionary of [ru, ro]) {
      expect(leafKeys({
        exchangeRates: dictionary.money.exchangeRates,
        transfer: dictionary.money.transfer,
        transferRateMissing: dictionary.money.errors.transferRateMissing,
      })).toEqual(english);
    }
  });
});
