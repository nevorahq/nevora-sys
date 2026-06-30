// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ExtractionReviewActions } from "./extraction-review-actions";

const mocks = vi.hoisted(() => ({
  createAccount: vi.fn(),
  confirmTransaction: vi.fn(),
  rejectTransaction: vi.fn(),
  retryExtraction: vi.fn(),
  refresh: vi.fn(),
  randomUUID: vi.fn(() => "0cf708ad-2f5d-4d2b-b88f-90fc934ad4f5"),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("@/modules/moneyflow/actions/create-account-for-document-expense.action", () => ({
  createAccountForDocumentExpenseAction: mocks.createAccount,
}));

vi.mock("@/modules/moneyflow/actions/confirm-document-transaction.action", () => ({
  confirmDocumentTransactionAction: mocks.confirmTransaction,
}));

vi.mock("@/modules/moneyflow/actions/reject-document-transaction.action", () => ({
  rejectDocumentTransactionAction: mocks.rejectTransaction,
}));

vi.mock("../actions/retry-document-extraction.action", () => ({
  retryDocumentExtractionAction: mocks.retryExtraction,
}));

const baseProps = {
  documentId: "a4c1216e-e85e-4d6c-8893-af0363ff8d1f",
  transactionId: "7b113e6e-c727-4308-baf9-c8f813ece4d5",
  canConfirm: true,
  needsAccount: true,
  compatibleAccounts: [],
};

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };

  Object.defineProperty(globalThis.crypto, "randomUUID", {
    configurable: true,
    value: mocks.randomUUID,
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.randomUUID.mockReturnValue("0cf708ad-2f5d-4d2b-b88f-90fc934ad4f5");
});

afterEach(cleanup);

describe("ExtractionReviewActions inline account creation", () => {
  it.each(["USD", "EUR", "RON"])("renders an actionable %s warning", (currency) => {
    render(<ExtractionReviewActions {...baseProps} requiredCurrency={currency} />);

    expect(screen.getByText(`This is a ${currency} expense, but you have no active ${currency} account.`)).toBeTruthy();
    expect(screen.getByRole("button", { name: `Create ${currency} account` })).toBeTruthy();
    expect((screen.getByRole("button", { name: /Confirm transaction/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("prefills the account form and locks the known currency", async () => {
    const user = userEvent.setup();
    render(<ExtractionReviewActions {...baseProps} requiredCurrency="USD" />);

    await user.click(screen.getByRole("button", { name: "Create USD account" }));

    const dialog = screen.getByRole("dialog") as HTMLDialogElement;
    const name = screen.getByLabelText("Account name") as HTMLInputElement;
    const currency = screen.getByLabelText("Currency") as HTMLInputElement;
    const type = screen.getByLabelText("Account type") as HTMLSelectElement;

    expect(dialog.open).toBe(true);
    expect(name.value).toBe("USD Account");
    expect(currency.value).toBe("USD");
    expect(currency.disabled).toBe(true);
    expect(type.value).toBe("card");
  });

  it("keeps the dialog open and displays a recoverable action error", async () => {
    mocks.createAccount.mockResolvedValue({ error: "You do not have permission to create accounts." });
    const user = userEvent.setup();
    render(<ExtractionReviewActions {...baseProps} requiredCurrency="USD" />);

    await user.click(screen.getByRole("button", { name: "Create USD account" }));
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "You do not have permission to create accounts.",
    );
    expect((screen.getByRole("dialog") as HTMLDialogElement).open).toBe(true);
  });

  it("submits only once while the first request is pending", async () => {
    let resolveRequest: ((value: { error: string }) => void) | undefined;
    mocks.createAccount.mockImplementation(
      () => new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );
    const user = userEvent.setup();
    render(<ExtractionReviewActions {...baseProps} requiredCurrency="USD" />);

    await user.click(screen.getByRole("button", { name: "Create USD account" }));
    const submit = screen.getByRole("button", { name: "Create account" });
    fireEvent.click(submit);
    fireEvent.click(submit);

    await waitFor(() => expect(mocks.createAccount).toHaveBeenCalledTimes(1));
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    resolveRequest?.({ error: "Temporary error" });
    await screen.findByRole("alert");
  });

  it("selects the returned account, closes the dialog, and enables explicit confirmation", async () => {
    mocks.createAccount.mockResolvedValue({
      account: { id: "usd-account", name: "USD Card", currency: "USD" },
      created: true,
    });
    mocks.confirmTransaction.mockResolvedValue({});
    const user = userEvent.setup();
    render(<ExtractionReviewActions {...baseProps} requiredCurrency="USD" />);

    await user.click(screen.getByRole("button", { name: "Create USD account" }));
    await user.clear(screen.getByLabelText("Account name"));
    await user.type(screen.getByLabelText("Account name"), "USD Card");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("status")).toHaveProperty(
      "textContent",
      expect.stringContaining("USD account created successfully."),
    );
    expect(document.querySelector("dialog")).toBeNull();

    const confirm = screen.getByRole("button", { name: /Confirm transaction/i }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);
    await user.click(confirm);

    expect(mocks.confirmTransaction).toHaveBeenCalledWith("7b113e6e-c727-4308-baf9-c8f813ece4d5", "usd-account");
  });

  it("does not treat inactive accounts as compatible input", () => {
    render(<ExtractionReviewActions {...baseProps} requiredCurrency="USD" compatibleAccounts={[]} />);

    expect(screen.getByRole("button", { name: "Create USD account" })).toBeTruthy();
    expect((screen.getByRole("button", { name: /Confirm transaction/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("submits reviewed category/context and explicit learning consent", async () => {
    mocks.confirmTransaction.mockResolvedValue({});
    const user = userEvent.setup();
    render(
      <ExtractionReviewActions
        {...baseProps}
        needsAccount={false}
        categories={[
          { id: "11111111-1111-4111-8111-111111111111", name: "Transport" },
          { id: "22222222-2222-4222-8222-222222222222", name: "Food" },
        ]}
        contexts={[
          { id: "33333333-3333-4333-8333-333333333333", name: "Work", slug: "work", visibility: "organization" },
          { id: "44444444-4444-4444-8444-444444444444", name: "Personal", slug: "personal", visibility: "private" },
        ]}
        initialCategoryId="11111111-1111-4111-8111-111111111111"
        initialContextId="33333333-3333-4333-8333-333333333333"
        initialMerchantName="Bolt SRL"
        initialAmount={50}
        initialTransactionDate="2026-06-28"
        initialCurrency="EUR"
      />,
    );

    await user.selectOptions(screen.getByLabelText("Category"), "22222222-2222-4222-8222-222222222222");
    await user.selectOptions(screen.getByLabelText("Expense context"), "44444444-4444-4444-8444-444444444444");
    await user.click(screen.getByLabelText(/Remember this choice/i));
    await user.click(screen.getByRole("button", { name: /Confirm transaction/i }));

    expect(mocks.confirmTransaction).toHaveBeenCalledWith(
      "7b113e6e-c727-4308-baf9-c8f813ece4d5",
      undefined,
      {
        categoryId: "22222222-2222-4222-8222-222222222222",
        expenseContextId: "44444444-4444-4444-8444-444444444444",
        rememberChoice: true,
        merchantName: "Bolt SRL",
        amount: 50,
        transactionDate: "2026-06-28",
        currency: "EUR",
      },
    );
  });
});
