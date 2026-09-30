import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import type { Locale } from "@/shared/i18n/constants";
import { DIGEST_ITEM_LIMIT, orderDigestItems, type DigestCounts, type DigestItem } from "./compose-digest";

/**
 * The daily digest as an email (ADR 003, step 2). Pure. The lines are the same
 * as the Telegram digest (shared copy), wrapped in a small table-free HTML body
 * with a plain-text alternative. Item titles and the organization name are user
 * content: always HTML-escaped.
 */

export interface DigestEmail {
  subject: string;
  html: string;
  text: string;
  /** For the List-Unsubscribe header: where the user turns the email off. */
  settingsUrl: string;
}

export interface DigestEmailContext {
  digest: Dictionary["channels"]["telegram"]["digest"];
  email: Dictionary["channels"]["email"]["digest"];
  locale: Locale;
  organizationName: string;
  actionCenterUrl: string;
  settingsUrl: string;
}

const TITLE_MAX = 120;

export function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char] ?? char);
}

function clean(title: string): string {
  const flat = title.replace(/\s+/g, " ").trim();
  return flat.length > TITLE_MAX ? `${flat.slice(0, TITLE_MAX - 1)}…` : flat;
}

/** Null when there is nothing to report. */
export function composeDigestEmail(counts: DigestCounts, items: DigestItem[], ctx: DigestEmailContext): DigestEmail | null {
  if (counts.needsAttention <= 0) return null;
  const { digest, email } = ctx;
  const count = (template: string, value: number) => template.replace("{count}", String(value));

  const summary: string[] = [];
  if (counts.overdue > 0) summary.push(count(digest.overdue, counts.overdue));
  if (counts.dueToday > 0) summary.push(count(digest.dueToday, counts.dueToday));
  summary.push(count(digest.needsAttention, counts.needsAttention));

  const shown = orderDigestItems(items).slice(0, DIGEST_ITEM_LIMIT).map((item) => ({
    title: clean(item.title),
    tag: item.bucket === "overdue" ? digest.overdueTag : item.bucket === "today" ? digest.todayTag : null,
    urgent: item.bucket === "overdue",
  }));
  const hidden = counts.needsAttention - shown.length;
  const intro = email.intro.replace("{org}", ctx.organizationName);
  const subject = count(email.subject, counts.needsAttention);

  const text = [
    digest.title,
    "",
    intro,
    "",
    ...summary,
    ...(shown.length ? ["", ...shown.map((item) => `• ${item.title}${item.tag ? ` — ${item.tag}` : ""}`)] : []),
    ...(shown.length && hidden > 0 ? [count(digest.more, hidden)] : []),
    "",
    `${digest.open}: ${ctx.actionCenterUrl}`,
    "",
    email.why,
    `${email.settingsLink}: ${ctx.settingsUrl}`,
  ].join("\n");

  const itemRows = shown
    .map(
      (item) =>
        `<li style="margin:0 0 8px;line-height:1.45">${escapeHtml(item.title)}${
          item.tag ? ` <span style="color:${item.urgent ? "#b42318" : "#6b7280"};font-size:13px">— ${escapeHtml(item.tag)}</span>` : ""
        }</li>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="${ctx.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;background:#f6f7f8;font-family:Arial,Helvetica,sans-serif;color:#20242a">
  <span style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(email.preheader)}</span>
  <main style="max-width:560px;margin:32px auto;background:#ffffff;border-radius:16px;padding:32px">
    <p style="margin:0 0 20px;font-size:14px;color:#6b7280">Nevora Business OS</p>
    <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3">${escapeHtml(digest.title)}</h1>
    <p style="margin:0 0 20px;line-height:1.5;color:#374151">${escapeHtml(intro)}</p>
    <div style="background:#f3f8f4;border-radius:12px;padding:16px 20px;margin:0 0 20px">
      ${summary.map((line) => `<p style="margin:0 0 6px;font-weight:600">${escapeHtml(line)}</p>`).join("")}
    </div>
    ${shown.length ? `<ul style="margin:0 0 8px;padding-left:20px">${itemRows}</ul>` : ""}
    ${shown.length && hidden > 0 ? `<p style="margin:0 0 20px;color:#6b7280;font-size:14px">${escapeHtml(count(digest.more, hidden))}</p>` : ""}
    <p style="margin:24px 0">
      <a href="${escapeHtml(ctx.actionCenterUrl)}" style="display:inline-block;background:#20242a;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:600">${escapeHtml(digest.open)}</a>
    </p>
    <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#6b7280">${escapeHtml(email.why)}
      <a href="${escapeHtml(ctx.settingsUrl)}" style="color:#6b7280">${escapeHtml(email.settingsLink)}</a></p>
  </main>
</body></html>`;

  return { subject, html, text, settingsUrl: ctx.settingsUrl };
}
