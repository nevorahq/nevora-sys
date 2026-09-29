import { extractAddress, sameMailbox } from "./inbound-address";

/**
 * Turning a received email into a capture: pure helpers, no I/O.
 */

/** The fields of a received email these helpers read (Resend receiving API). */
export interface ReceivedEmail {
  from: string;
  subject: string;
  text: string | null;
  html: string | null;
  headers: Record<string, string> | null;
  messageId: string;
  authentication?: { spf?: string; dkim?: string; dmarc?: string } | null;
}

function header(email: ReceivedEmail, name: string): string | null {
  if (!email.headers) return null;
  const key = Object.keys(email.headers).find((candidate) => candidate.toLowerCase() === name);
  return key ? email.headers[key] ?? null : null;
}

/**
 * Whether the user themself sent or forwarded this. A manual forward comes
 * From the user (and must not fail DMARC, so their own address cannot simply
 * be spoofed); Gmail's automatic forwarding keeps the original sender but names
 * the forwarding mailbox in `X-Forwarded-For`.
 */
export function isSentByOwner(email: ReceivedEmail, ownerAddresses: readonly string[]): boolean {
  const owners = ownerAddresses.filter(Boolean);
  const from = extractAddress(email.from);
  if (from && owners.some((owner) => sameMailbox(owner, from))) {
    return email.authentication?.dmarc?.toLowerCase() !== "fail";
  }
  const forwardedFor = header(email, "x-forwarded-for");
  if (forwardedFor) {
    const forwarders = forwardedFor.split(/[\s,]+/).map(extractAddress).filter((a): a is string => Boolean(a));
    return forwarders.some((forwarder) => owners.some((owner) => sameMailbox(owner, forwarder)));
  }
  return false;
}

/** Bounces, out-of-office and other machine mail: never captured, never answered. */
export function isAutomated(email: ReceivedEmail): boolean {
  const autoSubmitted = header(email, "auto-submitted")?.toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") return true;
  const from = extractAddress(email.from) ?? "";
  return /^(mailer-daemon|postmaster)@/.test(from);
}

export interface ForwardingConfirmation {
  code: string | null;
  link: string | null;
  /** The mailbox asking to forward here. */
  requestedBy: string | null;
}

/**
 * Gmail's "Forwarding Confirmation" mail, sent to a new forwarding address. It
 * is not a capture: the user needs its code (or link) to finish the Gmail
 * setup, so Settings shows it.
 */
export function readGmailForwardingConfirmation(email: ReceivedEmail): ForwardingConfirmation | null {
  const from = extractAddress(email.from);
  if (from !== "forwarding-noreply@google.com") return null;
  const body = `${email.subject}\n${email.text ?? htmlToText(email.html ?? "")}`;
  const code = email.subject.match(/\(#(\d{6,12})\)/)?.[1] ?? body.match(/(?:code|код|cod)\D{0,20}(\d{6,12})/i)?.[1] ?? null;
  const link = body.match(/https:\/\/mail(?:-settings)?\.google\.com\/mail\/[^\s"'<>]+/)?.[0] ?? null;
  const requestedBy = email.subject.match(/from\s+([^\s)]+@[^\s)]+)/i)?.[1]?.toLowerCase() ?? null;
  return { code, link, requestedBy };
}

/** A capture's text: subject and the meaningful part of the body. */
export function captureTextFromEmail(email: ReceivedEmail, maxLength: number): string {
  const subject = cleanSubject(email.subject);
  const body = meaningfulBody(email.text?.trim() ? email.text : htmlToText(email.html ?? ""));
  const text = [subject, body].filter(Boolean).join("\n\n");
  return text.length > maxLength ? text.slice(0, maxLength).trimEnd() : text;
}

/** Enough words in the body to be worth an AI read on its own (not "see attached"). */
export function hasSubstantialBody(email: ReceivedEmail): boolean {
  const body = meaningfulBody(email.text?.trim() ? email.text : htmlToText(email.html ?? ""));
  return body.replace(/\s+/g, " ").trim().length >= 40;
}

/** `Fwd: Re: FW: Invoice 42` → `Invoice 42`. */
export function cleanSubject(subject: string): string {
  return subject.replace(/^\s*((re|fwd?|fw|aw|wg|tr|rv|отв|пересл)\s*:\s*)+/i, "").trim();
}

const FORWARD_MARKERS = [
  /^-{2,}\s*forwarded message\s*-{2,}$/i,
  /^-{2,}\s*пересылаемое сообщение\s*-{2,}$/i,
  /^-{2,}\s*mesaj redirecționat\s*-{2,}$/i,
  /^begin forwarded message:?$/i,
  /^-{2,}\s*original message\s*-{2,}$/i,
];
const REPLY_MARKER = /^(on .{4,200} wrote:|.{4,200} написал\(а\):|.{4,200} a scris:)$/i;
const SIGNATURE_MARKER = /^(--|—|sent from my .+|отправлено с .+|trimis de pe .+)\s*$/i;

/**
 * The part of a body a person meant: for a forward, the forwarded message
 * itself (its header block dropped); otherwise the new text above any quoted
 * reply and signature.
 */
export function meaningfulBody(raw: string): string {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const forwardAt = lines.findIndex((line) => FORWARD_MARKERS.some((marker) => marker.test(line.trim())));

  let body: string[];
  if (forwardAt >= 0) {
    const note = lines.slice(0, forwardAt);
    const forwarded = dropForwardHeaders(lines.slice(forwardAt + 1));
    body = [...stripQuotedAndSignature(note), ...(note.some((l) => l.trim()) ? [""] : []), ...forwarded];
  } else {
    body = stripQuotedAndSignature(lines);
  }
  return body.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function stripQuotedAndSignature(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (REPLY_MARKER.test(trimmed) || SIGNATURE_MARKER.test(trimmed)) break;
    if (trimmed.startsWith(">")) continue;
    out.push(line);
  }
  return out;
}

/** Drop the `From: / Date: / Subject: / To:` block that opens a forwarded message. */
function dropForwardHeaders(lines: string[]): string[] {
  let index = 0;
  while (index < lines.length && (!lines[index].trim() || /^(from|de|от|date|data|дата|sent|subject|subiect|тема|to|către|кому|cc|копия):/i.test(lines[index].trim()))) {
    index += 1;
  }
  return lines.slice(index);
}

/** Readable text from an HTML body: block breaks kept, tags, styles and entities removed. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Mailbox providers anyone can sign up to: a domain rule on these would file
 * every stranger's mail under one project, so they only ever get a per-address
 * rule. Not exhaustive — an unlisted provider just gets a domain rule the user
 * can delete.
 */
const PUBLIC_MAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com",
  "yahoo.com", "ymail.com", "icloud.com", "me.com", "mac.com", "aol.com",
  "proton.me", "protonmail.com", "pm.me", "gmx.com", "gmx.net", "gmx.de", "web.de",
  "mail.com", "zoho.com", "yandex.ru", "yandex.com", "ya.ru", "mail.ru", "bk.ru",
  "inbox.ru", "list.ru", "rambler.ru", "mail.md", "yahoo.ro",
]);

const FORWARDED_FROM = /^(from|от|de la|de)\s*:\s*(.+)$/i;

/**
 * Who originally wrote a forwarded email: with Gmail's automatic forwarding the
 * `From` is still the original sender; with a manual forward `From` is the
 * owner, and the sender is the `From:` line that opens the forwarded message.
 * Null for the owner's own mail (nothing was forwarded).
 */
export function originalSender(email: ReceivedEmail, ownerAddresses: readonly string[]): string | null {
  const owners = ownerAddresses.filter(Boolean);
  const isOwner = (address: string) => owners.some((owner) => sameMailbox(owner, address));
  const from = extractAddress(email.from);
  if (from && !isOwner(from)) return from;

  const lines = (email.text?.trim() ? email.text : htmlToText(email.html ?? "")).replace(/\r\n?/g, "\n").split("\n");
  const forwardAt = lines.findIndex((line) => FORWARD_MARKERS.some((marker) => marker.test(line.trim())));
  if (forwardAt < 0) return null;
  for (const line of lines.slice(forwardAt + 1, forwardAt + 12)) {
    const match = line.trim().match(FORWARDED_FROM);
    if (!match) continue;
    const address = extractAddress(match[2]);
    return address && !isOwner(address) ? address : null;
  }
  return null;
}

/**
 * The source a learned project rule can match (migration 125): the original
 * sender, and their domain unless it is a public mailbox provider.
 */
export function emailSignals(email: ReceivedEmail, ownerAddresses: readonly string[]): { email_sender?: string; email_domain?: string } {
  const sender = originalSender(email, ownerAddresses);
  if (!sender) return {};
  const domain = sender.split("@")[1];
  return domain && !PUBLIC_MAIL_DOMAINS.has(domain) ? { email_sender: sender, email_domain: domain } : { email_sender: sender };
}
