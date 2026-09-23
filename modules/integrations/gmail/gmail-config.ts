import "server-only";

export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export class GmailConfigurationError extends Error {
  constructor(message = "Gmail integration is not configured.") {
    super(message);
    this.name = "GmailConfigurationError";
  }
}

export interface GmailConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tokenEncryptionKey: string;
}

export function isGmailConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_GMAIL_CLIENT_ID
      && process.env.GOOGLE_GMAIL_CLIENT_SECRET
      && process.env.GMAIL_TOKEN_ENCRYPTION_KEY
      && process.env.NEXT_PUBLIC_APP_URL
      && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

export function getGmailConfig(): GmailConfig {
  const clientId = process.env.GOOGLE_GMAIL_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_GMAIL_CLIENT_SECRET;
  const tokenEncryptionKey = process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!clientId || !clientSecret || !tokenEncryptionKey || !appUrl) {
    throw new GmailConfigurationError();
  }

  let redirectUri: string;
  try {
    redirectUri = process.env.GOOGLE_GMAIL_REDIRECT_URI
      ? new URL(process.env.GOOGLE_GMAIL_REDIRECT_URI).toString()
      : new URL("/api/integrations/gmail/callback", appUrl).toString();
  } catch {
    throw new GmailConfigurationError("The Gmail OAuth redirect URI is invalid.");
  }

  return { clientId, clientSecret, redirectUri, tokenEncryptionKey };
}
