import { randomInt } from "node:crypto";

/**
 * Per-user forwarding address (ADR 002, step 4): `inbox-<token>@<domain>`.
 *
 * The token IS the identity — it is stored as the integration's
 * `external_user_id` (migration 121), so "which user is this for" never depends
 * on the sender, which automatic forwarding rewrites. It is random, long enough
 * not to be guessed, and rotatable from Settings.
 */

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
export const INBOX_TOKEN_LENGTH = 12;
const LOCAL_PART_PREFIX = "inbox-";

export function generateInboxToken(): string {
  let token = "";
  for (let i = 0; i < INBOX_TOKEN_LENGTH; i += 1) token += ALPHABET[randomInt(ALPHABET.length)];
  return token;
}

export function formatInboxAddress(token: string, domain: string): string {
  return `${LOCAL_PART_PREFIX}${token}@${domain}`;
}

/** The token of the first recipient on our inbound domain, or null. */
export function findInboxToken(recipients: readonly string[], domain: string): string | null {
  const suffix = `@${domain.toLowerCase()}`;
  for (const recipient of recipients) {
    const address = extractAddress(recipient);
    if (!address?.endsWith(suffix)) continue;
    const local = address.slice(0, -suffix.length);
    if (!local.startsWith(LOCAL_PART_PREFIX)) continue;
    const token = local.slice(LOCAL_PART_PREFIX.length).split("+")[0];
    if (token.length === INBOX_TOKEN_LENGTH && [...token].every((char) => ALPHABET.includes(char))) return token;
  }
  return null;
}

/** `Anna <Anna@Example.com>` → `anna@example.com`; null when there is no address. */
export function extractAddress(value: string | null | undefined): string | null {
  if (!value) return null;
  const angle = value.match(/<([^<>\s]+@[^<>\s]+)>/);
  const bare = angle?.[1] ?? value.match(/[^\s<>"',;]+@[^\s<>"',;]+/)?.[0];
  return bare ? bare.trim().toLowerCase() : null;
}

/**
 * Compare addresses the way a mailbox owner means them: case-insensitive and
 * ignoring a `+tag` (anna+work@x is anna@x).
 */
export function sameMailbox(a: string, b: string): boolean {
  const normalize = (address: string) => {
    const [local, domain] = address.toLowerCase().split("@");
    return `${local.split("+")[0]}@${domain}`;
  };
  return normalize(a) === normalize(b);
}
