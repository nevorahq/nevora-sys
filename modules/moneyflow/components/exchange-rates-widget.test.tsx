// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { en } from "@/shared/i18n/dictionaries/en";
import { ExchangeRatesWidget } from "./exchange-rates-widget";
import type { ExchangeRateOverview } from "../queries/get-exchange-rates";

vi.mock("../actions/save-exchange-rate.action", () => ({
  saveExchangeRateAction: vi.fn(async () => ({})),
}));
vi.mock("@/modules/billing/components/access-state", () => ({
  useAccessGate: () => ({ blocked: false, message: "" }),
}));

afterEach(cleanup);

const overview: ExchangeRateOverview = {
  baseCurrency: "MDL",
  currencies: [{
    currency: "EUR",
    current: {
      rate: 0.0495049505,
      source: "manual",
      effectiveDate: "2026-07-16",
      provider: null,
      rateKind: "mid",
      isStale: false,
      exchangeRateId: "11111111-1111-4111-8111-111111111111",
    },
    baseRate: 20.2,
    referenceBaseRate: 20,
  }],
  history: [],
};

describe("ExchangeRatesWidget", () => {
  it("uses the explicit one-foreign-unit-to-org-base convention", () => {
    render(<ExchangeRatesWidget overview={overview} canManage dict={en} />);

    expect(screen.getByText("1 EUR = 20.2 MDL")).toBeTruthy();
    expect(screen.getByText("Reference rate: 1 EUR = 20 MDL")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Quote currency"), { target: { value: "EUR" } });
    fireEvent.change(screen.getByLabelText("1 EUR = … MDL"), { target: { value: "2,02" } });

    expect(screen.getByText("Enter: 1 EUR = X MDL.")).toBeTruthy();
    expect(screen.getByText(/This rate differs significantly/)).toBeTruthy();
    expect(screen.getByText(/I checked the direction and value/)).toBeTruthy();
  });
});
