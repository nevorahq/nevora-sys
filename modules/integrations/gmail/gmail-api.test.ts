import { describe, expect, it } from "vitest";
import {
  buildSubscriptionInvoiceQuery,
  flattenMessageParts,
  messageToInvoiceCandidates,
  type GmailMessagePart,
} from "./gmail-api";

describe("Gmail invoice matching", () => {
  it("builds a constrained PDF query from the subscription identity", () => {
    expect(buildSubscriptionInvoiceQuery({
      name: "Adobe Creative Cloud",
      url: "https://www.adobe.com/account",
    })).toBe('has:attachment filename:pdf newer_than:24m {"Adobe Creative Cloud" from:(adobe.com)}');
  });

  it("neutralizes Gmail operators embedded in a subscription name", () => {
    expect(buildSubscriptionInvoiceQuery({ name: 'Vendor" from:attacker@example.com' }))
      .toBe('has:attachment filename:pdf newer_than:24m "Vendor from:attacker@example.com"');
  });

  it("walks nested MIME parts and exposes only PDF attachments", () => {
    const payload: GmailMessagePart = {
      headers: [
        { name: "Subject", value: "Your monthly invoice" },
        { name: "From", value: "Billing <billing@example.com>" },
      ],
      parts: [
        { partId: "0", mimeType: "text/plain", body: { data: "aGVsbG8" } },
        {
          partId: "1",
          mimeType: "multipart/mixed",
          parts: [
            { partId: "1.1", filename: "invoice.pdf", mimeType: "application/pdf", body: { attachmentId: "a1", size: 1234 } },
            { partId: "1.2", filename: "logo.png", mimeType: "image/png", body: { attachmentId: "a2", size: 50 } },
          ],
        },
      ],
    };

    expect(flattenMessageParts(payload)).toHaveLength(5);
    expect(messageToInvoiceCandidates({ id: "message-1", internalDate: "1704067200000", payload }))
      .toEqual([expect.objectContaining({
        messageId: "message-1",
        partId: "1.1",
        filename: "invoice.pdf",
        size: 1234,
        subject: "Your monthly invoice",
      })]);
  });
});
