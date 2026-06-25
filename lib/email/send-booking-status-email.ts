import "server-only";

import { Resend } from "resend";
import { buildBookingStatusEmail, type BookingStatusEmailInput } from "./booking-status-email";

export type EmailDeliveryResult =
  | { status: "sent"; providerMessageId: string | null }
  | { status: "skipped"; reason: "missing_recipient" | "not_configured" }
  | { status: "failed"; reason: string };

export async function sendBookingStatusEmail(
  input: BookingStatusEmailInput,
): Promise<EmailDeliveryResult> {
  if (!input.to) return { status: "skipped", reason: "missing_recipient" };

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    console.warn("[email] Resend is not configured; booking status email was skipped.");
    return { status: "skipped", reason: "not_configured" };
  }

  const email = buildBookingStatusEmail(input);
  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from,
    to: [input.to],
    subject: email.subject,
    html: email.html,
  });

  if (error) {
    console.error("[email] Resend booking status delivery failed:", error);
    return { status: "failed", reason: error.message };
  }

  return { status: "sent", providerMessageId: data?.id ?? null };
}
