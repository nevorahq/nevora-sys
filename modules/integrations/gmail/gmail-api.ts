import "server-only";

import { getGmailConfig, GMAIL_READONLY_SCOPE } from "./gmail-config";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API_URL = "https://gmail.googleapis.com/gmail/v1/users/me";

export interface GoogleTokenResponse {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
}

export interface GmailMessagePart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name?: string; value?: string }>;
  body?: { attachmentId?: string; size?: number; data?: string };
  parts?: GmailMessagePart[];
}

interface GmailMessage {
  id: string;
  internalDate?: string;
  payload?: GmailMessagePart;
}

export interface GmailInvoiceCandidate {
  messageId: string;
  partId: string;
  filename: string;
  mimeType: string;
  size: number;
  subject: string;
  sender: string;
  receivedAt: string;
}

export function buildGoogleAuthorizationUrl(state: string): string {
  const config = getGmailConfig();
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GMAIL_READONLY_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

async function tokenRequest(params: URLSearchParams): Promise<GoogleTokenResponse> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("Google rejected the OAuth token request.");
  const payload = await response.json() as Partial<GoogleTokenResponse>;
  if (!payload.access_token) throw new Error("Google did not return an access token.");
  return payload as GoogleTokenResponse;
}

export function exchangeGoogleAuthorizationCode(code: string): Promise<GoogleTokenResponse> {
  const config = getGmailConfig();
  return tokenRequest(new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
  }));
}

export function refreshGoogleAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const config = getGmailConfig();
  return tokenRequest(new URLSearchParams({
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
  }));
}

async function gmailFetch<T>(accessToken: string, path: string): Promise<T> {
  const response = await fetch(`${GMAIL_API_URL}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("Gmail access is no longer authorized. Reconnect Gmail and try again.");
    }
    throw new Error("Gmail could not complete the request.");
  }
  return response.json() as Promise<T>;
}

export async function getGmailProfile(accessToken: string): Promise<{ emailAddress: string }> {
  const profile = await gmailFetch<{ emailAddress?: string }>(accessToken, "/profile");
  if (!profile.emailAddress) throw new Error("Gmail did not return an account address.");
  return { emailAddress: profile.emailAddress };
}

function quoteGmailSearchTerm(value: string): string {
  return `"${value.replace(/["\\]/g, " ").replace(/\s+/g, " ").trim()}"`;
}

export function buildSubscriptionInvoiceQuery(subscription: { name: string; url?: string | null }): string {
  const identifiers = [quoteGmailSearchTerm(subscription.name)];
  if (subscription.url) {
    try {
      const hostname = new URL(subscription.url).hostname.replace(/^www\./, "");
      if (hostname) identifiers.push(`from:(${hostname})`);
    } catch {
      // The subscription schema already validates URLs; ignore legacy invalid values.
    }
  }
  const identityQuery = identifiers.length > 1 ? `{${identifiers.join(" ")}}` : identifiers[0];
  return `has:attachment filename:pdf newer_than:24m ${identityQuery}`;
}

function header(part: GmailMessagePart | undefined, name: string): string {
  return part?.headers?.find((item) => item.name?.toLowerCase() === name.toLowerCase())?.value?.trim() ?? "";
}

export function flattenMessageParts(part: GmailMessagePart | undefined): GmailMessagePart[] {
  if (!part) return [];
  return [part, ...(part.parts ?? []).flatMap(flattenMessageParts)];
}

export function messageToInvoiceCandidates(message: GmailMessage): GmailInvoiceCandidate[] {
  const subject = header(message.payload, "subject") || "(no subject)";
  const sender = header(message.payload, "from") || "Unknown sender";
  const parsedHeaderDate = Date.parse(header(message.payload, "date"));
  const internalDate = message.internalDate ? Number(message.internalDate) : Number.NaN;
  const receivedAt = new Date(
    Number.isFinite(internalDate) ? internalDate : Number.isNaN(parsedHeaderDate) ? 0 : parsedHeaderDate,
  ).toISOString();

  return flattenMessageParts(message.payload)
    .filter((part) => {
      const filename = part.filename?.trim() ?? "";
      return Boolean(filename && part.partId && (part.mimeType === "application/pdf" || filename.toLowerCase().endsWith(".pdf")));
    })
    .map((part) => ({
      messageId: message.id,
      partId: part.partId as string,
      filename: part.filename!.trim(),
      mimeType: part.mimeType || "application/pdf",
      size: part.body?.size ?? 0,
      subject,
      sender,
      receivedAt,
    }));
}

export async function searchSubscriptionInvoices(input: {
  accessToken: string;
  subscription: { name: string; url?: string | null };
  maxResults?: number;
}): Promise<{ query: string; candidates: GmailInvoiceCandidate[] }> {
  const query = buildSubscriptionInvoiceQuery(input.subscription);
  const params = new URLSearchParams({ q: query, maxResults: String(input.maxResults ?? 15) });
  const list = await gmailFetch<{ messages?: Array<{ id: string }> }>(input.accessToken, `/messages?${params}`);
  const messages = await Promise.all(
    (list.messages ?? []).map(({ id }) => gmailFetch<GmailMessage>(input.accessToken, `/messages/${encodeURIComponent(id)}?format=full`)),
  );
  const candidates = messages
    .flatMap(messageToInvoiceCandidates)
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  return { query, candidates };
}

export async function downloadGmailAttachment(input: {
  accessToken: string;
  messageId: string;
  partId: string;
}): Promise<{ filename: string; mimeType: string; data: Buffer }> {
  const message = await gmailFetch<GmailMessage>(
    input.accessToken,
    `/messages/${encodeURIComponent(input.messageId)}?format=full`,
  );
  const part = flattenMessageParts(message.payload).find((item) => item.partId === input.partId);
  const filename = part?.filename?.trim() ?? "";
  if (!part || !filename || !(part.mimeType === "application/pdf" || filename.toLowerCase().endsWith(".pdf"))) {
    throw new Error("The selected PDF attachment no longer exists in Gmail.");
  }

  let encoded = part.body?.data;
  if (!encoded && part.body?.attachmentId) {
    const body = await gmailFetch<{ data?: string }>(
      input.accessToken,
      `/messages/${encodeURIComponent(input.messageId)}/attachments/${encodeURIComponent(part.body.attachmentId)}`,
    );
    encoded = body.data;
  }
  if (!encoded) throw new Error("Gmail returned an empty attachment.");
  return { filename, mimeType: "application/pdf", data: Buffer.from(encoded, "base64url") };
}

export async function revokeGoogleToken(token: string): Promise<void> {
  await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
}
