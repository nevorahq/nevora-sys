import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/auth/require-org";
import { requireAppAccess, isAccessError } from "@/lib/security";
import { isGmailConfigured, getGmailConfig } from "@/modules/integrations/gmail/gmail-config";
import { deleteGmailConnection, getGmailConnection } from "@/modules/integrations/gmail/gmail-store";
import { decryptGmailToken } from "@/modules/integrations/gmail/token-crypto";
import { revokeGoogleToken } from "@/modules/integrations/gmail/gmail-api";

export const runtime = "nodejs";

export async function GET() {
  try {
    const ctx = await requireOrg();
    if (!isGmailConfigured()) return NextResponse.json({ configured: false, connected: false });
    const connection = await getGmailConnection(ctx.org.id, ctx.user.id);
    return NextResponse.json({
      configured: true,
      connected: Boolean(connection),
      email: connection?.gmailAddress ?? null,
    });
  } catch {
    return NextResponse.json({ error: "Gmail connection status could not be read." }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const ctx = await requireAppAccess({ permission: "data.write", intent: "write" });
    const connection = await getGmailConnection(ctx.org.id, ctx.user.id);
    if (connection) {
      try {
        const token = decryptGmailToken(connection.refreshTokenCiphertext, getGmailConfig().tokenEncryptionKey);
        await revokeGoogleToken(token);
      } catch (error) {
        console.warn("Google token revocation failed; removing the local credential", error);
      }
      await deleteGmailConnection(ctx.org.id, ctx.user.id);
    }
    return NextResponse.json({ connected: false });
  } catch (error) {
    if (isAccessError(error)) return NextResponse.json({ error: error.message }, { status: error.httpStatus });
    return NextResponse.json({ error: "Gmail could not be disconnected." }, { status: 500 });
  }
}
