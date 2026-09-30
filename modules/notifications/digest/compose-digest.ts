import type { Dictionary } from "@/shared/i18n/dictionaries/en";

/**
 * The text of a daily digest (ADR 003). Pure: counts and items come from the
 * Action Center's own predicates, so the numbers match what the user sees in the
 * app. Plain text on purpose — item titles are user content and must never be
 * parsed as Markdown/HTML by the messenger.
 */

export const DIGEST_ITEM_LIMIT = 5;
const TITLE_MAX = 80;

export interface DigestCounts {
  overdue: number;
  dueToday: number;
  /** Every active item, dated or not — the Action Center's "Needs attention". */
  needsAttention: number;
}

export interface DigestItem {
  title: string;
  bucket: "overdue" | "today" | "other";
}

export interface ComposedDigest {
  text: string;
  /** The Action Center link for a button; null when it cannot be a button (non-https). */
  buttonUrl: string | null;
  buttonLabel: string;
  itemCount: number;
}

type DigestCopy = Dictionary["channels"]["telegram"]["digest"];

function shorten(title: string): string {
  const clean = title.replace(/\s+/g, " ").trim();
  return clean.length > TITLE_MAX ? `${clean.slice(0, TITLE_MAX - 1)}…` : clean;
}

/** Overdue first, then due today, then the rest — the order a user should act in. */
export function orderDigestItems(items: DigestItem[]): DigestItem[] {
  const rank = { overdue: 0, today: 1, other: 2 } as const;
  return [...items].sort((a, b) => rank[a.bucket] - rank[b.bucket]);
}

/**
 * Null when there is nothing to report — an empty day sends nothing.
 * `actionCenterUrl` must be absolute; Telegram accepts only https URLs on a button,
 * so anything else becomes a plain link line instead.
 */
export function composeDigest(
  counts: DigestCounts,
  items: DigestItem[],
  copy: DigestCopy,
  actionCenterUrl: string,
): ComposedDigest | null {
  if (counts.needsAttention <= 0) return null;

  const lines: string[] = [copy.title, ""];
  if (counts.overdue > 0) lines.push(copy.overdue.replace("{count}", String(counts.overdue)));
  if (counts.dueToday > 0) lines.push(copy.dueToday.replace("{count}", String(counts.dueToday)));
  lines.push(copy.needsAttention.replace("{count}", String(counts.needsAttention)));

  const shown = orderDigestItems(items).slice(0, DIGEST_ITEM_LIMIT);
  if (shown.length > 0) {
    lines.push("");
    for (const item of shown) {
      const tag = item.bucket === "overdue" ? ` — ${copy.overdueTag}` : item.bucket === "today" ? ` — ${copy.todayTag}` : "";
      lines.push(`• ${shorten(item.title)}${tag}`);
    }
    const hidden = counts.needsAttention - shown.length;
    if (hidden > 0) lines.push(copy.more.replace("{count}", String(hidden)));
  }

  const buttonUrl = actionCenterUrl.startsWith("https://") ? actionCenterUrl : null;
  if (!buttonUrl) lines.push("", copy.openLink.replace("{url}", actionCenterUrl));
  lines.push("", copy.footer);

  return { text: lines.join("\n"), buttonUrl, buttonLabel: copy.open, itemCount: counts.needsAttention };
}
