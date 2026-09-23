import "server-only";

import { getGmailConfig } from "./gmail-config";
import { refreshGoogleAccessToken } from "./gmail-api";
import { getGmailConnection } from "./gmail-store";
import { decryptGmailToken } from "./token-crypto";

export async function getGmailAccessForUser(organizationId: string, userId: string): Promise<{
  accessToken: string;
  gmailAddress: string;
} | null> {
  const connection = await getGmailConnection(organizationId, userId);
  if (!connection) return null;
  const refreshToken = decryptGmailToken(connection.refreshTokenCiphertext, getGmailConfig().tokenEncryptionKey);
  const token = await refreshGoogleAccessToken(refreshToken);
  return { accessToken: token.access_token, gmailAddress: connection.gmailAddress };
}
