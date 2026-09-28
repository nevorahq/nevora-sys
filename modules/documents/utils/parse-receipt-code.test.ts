import { describe, expect, it } from "vitest";
import {
  describeCodeForModel,
  parseReceiptCode,
  readStoredCodeHint,
  reconcileWithCode,
} from "./parse-receipt-code";

describe("parseReceiptCode", () => {
  it("returns null for an empty payload", () => {
    expect(parseReceiptCode("   ")).toBeNull();
  });

  it("reads a SEPA (EPC) payment QR", () => {
    const payload = [
      "BCD",
      "002",
      "1",
      "SCT",
      "BPOTBEB1",
      "Red Cross of Belgium",
      "BE72 0000 0001 6116",
      "EUR12.30",
      "CHAR",
      "",
      "Urgency fund",
    ].join("\n");
    const hint = parseReceiptCode(payload, "qr_code");
    expect(hint).toMatchObject({
      kind: "epc_payment",
      format: "qr_code",
      payeeName: "Red Cross of Belgium",
      iban: "BE72000000016116",
      amount: 12.3,
      currency: "EUR",
      reference: "Urgency fund",
    });
  });

  it("leaves the amount empty when an EPC QR has none", () => {
    const hint = parseReceiptCode("BCD\n002\n1\nSCT\n\nShop\nDE89370400440532013000\n\n");
    expect(hint).toMatchObject({ kind: "epc_payment", amount: null, currency: null });
  });

  it("reads a Swiss QR-bill", () => {
    const lines = Array.from({ length: 31 }, () => "");
    lines[0] = "SPC";
    lines[1] = "0200";
    lines[2] = "1";
    lines[3] = "CH44 3199 9123 0008 8901 2";
    lines[5] = "Robert Schneider AG";
    lines[18] = "1949.75";
    lines[19] = "CHF";
    lines[28] = "210000000003139471430009017";
    const hint = parseReceiptCode(lines.join("\r\n"));
    expect(hint).toMatchObject({
      kind: "swiss_qr_bill",
      payeeName: "Robert Schneider AG",
      iban: "CH4431999123000889012",
      amount: 1949.75,
      currency: "CHF",
      reference: "210000000003139471430009017",
    });
  });

  it("recognizes a Moldovan fiscal receipt link and reads named params only", () => {
    const hint = parseReceiptCode("https://mev.sfs.md/receipt-verifier?nr=5412&date=15.01.2026&sum=245,50");
    expect(hint).toMatchObject({
      kind: "md_fiscal",
      currency: "MDL",
      amount: 245.5,
      date: "2026-01-15",
      reference: "5412",
    });
    expect(hint?.url).toContain("mev.sfs.md");
  });

  it("keeps an unparameterized fiscal link as a hint without inventing values", () => {
    const hint = parseReceiptCode("https://mev.sfs.md/receipt-verifier/J403001576/5412");
    expect(hint).toMatchObject({ kind: "md_fiscal", amount: null, date: null, reference: null });
  });

  it("classifies a product barcode", () => {
    expect(parseReceiptCode("4006381333931", "ean_13")?.kind).toBe("product_code");
  });

  it("classifies other links and plain text", () => {
    expect(parseReceiptCode("https://example.com/r/123")?.kind).toBe("url");
    expect(parseReceiptCode("INV-2026-001")?.kind).toBe("text");
  });

  it("caps the payload", () => {
    expect(parseReceiptCode("x".repeat(5000))?.raw).toHaveLength(2000);
  });
});

describe("reconcileWithCode", () => {
  const epc = parseReceiptCode("BCD\n002\n1\nSCT\n\nShop\nDE89370400440532013000\nEUR20.00");

  it("passes the model values through without a code", () => {
    expect(reconcileWithCode(null, { amount: 5, currency: "EUR", date: "2026-01-01" })).toEqual({
      amount: 5,
      currency: "EUR",
      date: "2026-01-01",
      mismatches: [],
    });
  });

  it("lets the code win and reports the disagreement", () => {
    expect(reconcileWithCode(epc, { amount: 2, currency: "USD", date: "2026-01-01" })).toEqual({
      amount: 20,
      currency: "EUR",
      date: "2026-01-01",
      mismatches: ["amount", "currency"],
    });
  });

  it("fills a value the model could not read without flagging it", () => {
    expect(reconcileWithCode(epc, { amount: null, currency: "EUR", date: null }).mismatches).toEqual([]);
  });
});

describe("readStoredCodeHint", () => {
  it("re-parses a stored payload and rejects junk", () => {
    expect(readStoredCodeHint({ raw: "4006381333931", format: "ean_13" })?.kind).toBe("product_code");
    expect(readStoredCodeHint({ kind: "epc_payment" })).toBeNull();
    expect(readStoredCodeHint(null)).toBeNull();
  });
});

describe("describeCodeForModel", () => {
  it("lists only the values the code states", () => {
    const text = describeCodeForModel(epc());
    expect(text).toContain("amount: 20");
    expect(text).not.toContain("date:");
  });

  function epc() {
    return parseReceiptCode("BCD\n002\n1\nSCT\n\nShop\nDE89370400440532013000\nEUR20.00")!;
  }
});
