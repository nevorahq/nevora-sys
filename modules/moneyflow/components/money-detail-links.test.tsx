// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MoneyAccountsList } from "./money-accounts-list";
import { MoneyRecentTransactions } from "./money-recent-transactions";
import { AccountEditForm } from "./account-edit-form";
import { CreateAccountForm } from "./create-account-form";

vi.mock("../actions/deactivate-account.action", () => ({
  deactivateAccountAction: vi.fn(),
}));
vi.mock("../actions/update-account.action", () => ({
  updateAccountAction: vi.fn(),
}));
vi.mock("../actions/create-account.action", () => ({
  createAccountAction: vi.fn(),
}));
vi.mock("../actions/update-transaction.action", () => ({
  updateTransactionAction: vi.fn(),
}));
vi.mock("../actions/delete-transaction.action", () => ({
  deleteTransactionAction: vi.fn(),
}));
vi.mock("../actions/create-transfer.action", () => ({
  createTransferAction: vi.fn(),
}));

const dict = {
  common: { close: "Close", loading: "Loading" },
  money: {
    accounts: {
      title: "Accounts",
      editButton: "Edit account",
      deactivateButton: "Deactivate account",
      deactivateConfirm: "Deactivate?",
      nameLabel: "Name",
      namePlaceholder: "Name",
      typeLabel: "Type",
      currencyLabel: "Currency",
      balanceLabel: "Initial balance",
      balancePlaceholder: "0.00",
      add: "Add account",
      initialBalance: "Initial balance",
      updateButton: "Save",
      types: { cash: "Cash", card: "Card", bank: "Bank", savings: "Savings", other: "Other" },
    },
    transactions: {
      recent: "Recent transactions",
      editButton: "Edit transaction",
    },
    transfer: {
      title: "Transfer from",
      label: "Transfer",
      buttonLabel: "Transfer",
      fromLabel: "From account",
      toLabel: "To account",
      selectDestination: "Select account",
      amountLabel: "Amount",
      amountPlaceholder: "0.00",
      dateLabel: "Date",
      noteLabel: "Note",
      notePlaceholder: "Optional note",
      submit: "Transfer",
      noDestination: "No other account with the same currency.",
    },
  },
} as never;

afterEach(cleanup);

describe("Money detail navigation", () => {
  it("opens account details from the account card", () => {
    render(
      <MoneyAccountsList
        dict={dict}
        accounts={[{
          id: "11111111-1111-4111-8111-111111111111",
          user_id: "user-1",
          name: "USD Card",
          type: "card",
          initial_balance: 100,
          balance: 100,
          currency: "USD",
          is_active: true,
          created_at: "2026-01-01",
          updated_at: "2026-01-01",
        }]}
      />,
    );

    expect(screen.getByRole("link", { name: "Open account: USD Card" }).getAttribute("href"))
      .toBe("/dashboard/money/accounts/11111111-1111-4111-8111-111111111111");
  });

  it("opens transaction details from the transaction card", () => {
    render(
      <MoneyRecentTransactions
        dict={dict}
        transactions={[{
          id: "22222222-2222-4222-8222-222222222222",
          user_id: "user-1",
          account_id: "11111111-1111-4111-8111-111111111111",
          category_id: null,
          title: "Coffee",
          type: "expense",
          amount: 4.5,
          currency: "USD",
          transaction_date: "2026-06-27",
          note: null,
          from_account_id: null,
          to_account_id: null,
          created_at: "2026-06-27",
          updated_at: "2026-06-27",
          account: { name: "USD Card" },
          category: null,
          from_account: null,
          to_account: null,
        }]}
      />,
    );

    expect(screen.getByRole("link", { name: "Open transaction: Coffee" }).getAttribute("href"))
      .toBe("/dashboard/money/22222222-2222-4222-8222-222222222222");
  });

  it("allows the account initial balance to be edited", () => {
    render(
      <AccountEditForm
        dict={dict}
        account={{
          id: "11111111-1111-4111-8111-111111111111",
          user_id: "user-1",
          name: "USD Card",
          type: "card",
          initial_balance: 100,
          currency: "USD",
          is_active: true,
          created_at: "2026-01-01",
          updated_at: "2026-01-01",
        }}
      />,
    );

    const balance = screen.getByLabelText("Initial balance (USD)") as HTMLInputElement;
    expect(balance.value).toBe("100");
    expect(balance.disabled).toBe(false);
    expect(balance.getAttribute("name")).toBe("initial_balance");
  });

  it("allows a supported account currency to be selected at creation", () => {
    render(<CreateAccountForm dict={dict} defaultCurrency="USD" />);

    const currency = screen.getByLabelText("Currency") as HTMLSelectElement;
    expect(currency.value).toBe("USD");
    expect(currency.disabled).toBe(false);
    expect(currency.querySelector('option[value="EUR"]')).toBeTruthy();
    expect(currency.querySelector('option[value="MDL"]')).toBeTruthy();
    expect(currency.querySelector('option[value="RUB"]')?.textContent).toContain("RUR (RUB)");
    expect(currency.querySelector('option[value="RON"]')).toBeNull();
  });
});
