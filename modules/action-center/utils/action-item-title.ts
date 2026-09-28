import { en, type Dictionary } from "@/shared/i18n/dictionaries/en";

export type ActionItemTitles = Dictionary["actionCenter"]["titles"];
export type ActionItemTitleKey = keyof ActionItemTitles;

const TITLE_MAX_LENGTH = 200;
const NAME = "{name}";

/**
 * The stored title of a system-generated action item. Titles are persisted in
 * English, built from the English dictionary templates, so the screen can match
 * them back to a template and show them in the viewer's language.
 */
export function actionItemTitle(key: ActionItemTitleKey, name = ""): string {
  return en.actionCenter.titles[key].replace(NAME, name).slice(0, TITLE_MAX_LENGTH);
}

// Longest literal prefix first, so "Review document extraction: X" is never read
// as the plain "Review document extraction", nor "Review capture: X" as "Review: X".
const MATCHERS = (Object.keys(en.actionCenter.titles) as ActionItemTitleKey[])
  .map((key) => {
    const template = en.actionCenter.titles[key];
    return { key, prefix: template.split(NAME)[0], hasName: template.includes(NAME) };
  })
  .sort((a, b) => b.prefix.length - a.prefix.length);

/**
 * Render a stored title in the viewer's language. A title that matches no
 * template — user content such as a capture's own title — is returned unchanged.
 */
export function localizeActionItemTitle(stored: string, titles: ActionItemTitles): string {
  for (const { key, prefix, hasName } of MATCHERS) {
    if (!hasName) {
      if (stored === prefix) return titles[key];
      continue;
    }
    if (stored.startsWith(prefix) && stored.length > prefix.length) {
      return titles[key].replace(NAME, stored.slice(prefix.length));
    }
  }
  return stored;
}
