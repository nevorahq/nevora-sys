import { describe, expect, it } from "vitest";

import { CANONICAL_FINANCIAL_STATES } from "@/modules/moneyflow/lib/canonical-financial-state";
import {
  AREA_IDS,
  ATTENTION_IDS,
  FAQ_IDS,
  LANDING_LOCALES,
  getLandingContent,
} from "./landing-content";

/**
 * Структурная сетка для лендинга.
 *
 * `LandingContent = typeof en` сводит `id` к `string`, поэтому tsc НЕ ловит
 * рассинхрон областей между локалями: переводчик может переставить, потерять
 * или переименовать `id`, и сборка останется зелёной, а иконка молча съедет на
 * fallback. Эти проверки держат контракт «en — источник структуры».
 */
describe("landing content", () => {
  it("keeps the same area ids, in the same order, in every locale", () => {
    for (const locale of LANDING_LOCALES) {
      const ids = getLandingContent(locale).areas.items.map((item) => item.id);
      expect(ids, `areas ids for locale "${locale}"`).toEqual([...AREA_IDS]);
    }
  });

  it("keeps the same attention ids, in the same order, in every locale", () => {
    for (const locale of LANDING_LOCALES) {
      const ids = getLandingContent(locale).attention.items.map((item) => item.id);
      expect(ids, `attention ids for locale "${locale}"`).toEqual([...ATTENTION_IDS]);
    }
  });

  it("covers exactly the canonical financial states, so the shared badge labels every row", () => {
    // StatesSection рендерит по CANONICAL_FINANCIAL_STATES и берёт подпись из
    // словаря по id — незнакомый id останется без текста, а пропущенный оставит
    // каноническое состояние без описания. Держим множество id ровно равным.
    for (const locale of LANDING_LOCALES) {
      const ids = getLandingContent(locale).states.items.map((item) => item.id);
      expect([...ids].sort(), `states ids for locale "${locale}"`).toEqual(
        [...CANONICAL_FINANCIAL_STATES].sort(),
      );
    }
  });

  it("keeps the same FAQ ids, in the same order, with non-empty q/a, in every locale", () => {
    for (const locale of LANDING_LOCALES) {
      const items = getLandingContent(locale).faq.items;
      expect(
        items.map((item) => item.id),
        `faq ids for locale "${locale}"`,
      ).toEqual([...FAQ_IDS]);
      for (const item of items) {
        expect(item.q.length, `empty FAQ question "${item.id}" in "${locale}"`).toBeGreaterThan(0);
        expect(item.a.length, `empty FAQ answer "${item.id}" in "${locale}"`).toBeGreaterThan(0);
      }
    }
  });

  it("keeps the AI can/cannot lists non-empty and parallel across locales", () => {
    const en = getLandingContent("en").aiLimits;

    for (const locale of LANDING_LOCALES) {
      const ai = getLandingContent(locale).aiLimits;
      expect(ai.can.points.length, `can points for "${locale}"`).toBeGreaterThan(0);
      expect(ai.cannot.points.length, `cannot points for "${locale}"`).toBe(
        en.cannot.points.length,
      );
    }
  });

  it("translates every area — no locale falls back to the English copy", () => {
    const en = getLandingContent("en").areas.items;

    for (const locale of LANDING_LOCALES.filter((l) => l !== "en")) {
      const items = getLandingContent(locale).areas.items;
      items.forEach((item, i) => {
        expect(item.title, `untranslated area title "${item.id}" in "${locale}"`).not.toBe(
          en[i].title,
        );
        expect(item.text, `untranslated area text "${item.id}" in "${locale}"`).not.toBe(
          en[i].text,
        );
      });
    }
  });

  it("keeps nav anchors identical across locales (labels translate, hrefs do not)", () => {
    const hrefs = getLandingContent("en").nav.map((link) => link.href);

    for (const locale of LANDING_LOCALES) {
      expect(
        getLandingContent(locale).nav.map((link) => link.href),
        `nav hrefs for locale "${locale}"`,
      ).toEqual(hrefs);
    }
  });

  it("points every nav anchor at a section that exists on the page", () => {
    // Секции рендерят hero (#home), how (#how), areas (#areas), plans (#pricing),
    // contact (#contact). Ссылка в никуда — тихий баг: клик просто ничего не делает.
    const rendered = ["#home", "#how", "#areas", "#pricing", "#contact"];

    for (const link of getLandingContent("en").nav) {
      expect(rendered, `nav anchor "${link.href}" has no section`).toContain(link.href);
    }
  });
});
