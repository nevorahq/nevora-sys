"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangleIcon, CheckCircle2Icon, Loader2Icon, PlusIcon, QrCodeIcon, Trash2Icon } from "lucide-react";
import { Modal } from "@/shared/ui/modal";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/utils/cn";
import { ROUTES } from "@/shared/config/routes";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import type { Locale } from "@/shared/i18n/constants";
import { rejectFinancialSuggestion } from "@/modules/review/actions/financial-suggestion.actions";
import {
  getReceiptReviewAction,
  saveReviewedReceiptAction,
  type ReceiptReviewErrorCode,
} from "../actions/receipt-review.action";
import type { ReceiptReview } from "../services/receipt-review-service";

type ReceiptDict = Dictionary["inbox"]["receipt"];

const POLL_INTERVAL_MS = 2500;
/** ~2 minutes, like the Documents page poller. */
const MAX_POLLS = 48;
/** After ~20 s tell the user they may close and come back. */
const SLOW_AFTER_POLLS = 8;

const INTL_LOCALE: Record<Locale, string> = { en: "en-US", ru: "ru-RU", ro: "ro-RO" };

/**
 * Preview + correction of a captured receipt, opened right after a photo, scan
 * or document capture (and from the Review tab). Polls until extraction is done,
 * then shows every extracted field editable — issuer, date, currency, total and
 * the line items — and saves the corrections and the expense in one step.
 */
export function ReceiptReviewDialog({
  documentId,
  onClose,
  t,
  locale,
}: {
  /** The captured Document; null keeps the dialog closed. */
  documentId: string | null;
  onClose: () => void;
  t: ReceiptDict;
  locale: Locale;
}) {
  return (
    <Modal isOpen={documentId !== null} onClose={onClose} title={t.title} closeLabel={t.close}>
      {/* Keyed so each capture starts from a fresh poll and a fresh form. */}
      {documentId && <ReceiptReviewBody key={documentId} documentId={documentId} onClose={onClose} t={t} locale={locale} />}
    </Modal>
  );
}

function ReceiptReviewBody({
  documentId,
  onClose,
  t,
  locale,
}: {
  documentId: string;
  onClose: () => void;
  t: ReceiptDict;
  locale: Locale;
}) {
  const [review, setReview] = useState<ReceiptReview | null>(null);
  const [loadError, setLoadError] = useState<ReceiptReviewErrorCode | null>(null);
  const [polls, setPolls] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let count = 0;

    async function load() {
      const result = await getReceiptReviewAction(documentId).catch(() => null);
      if (cancelled) return;
      count += 1;
      setPolls(count);
      if (!result || !result.ok) {
        setLoadError(result && !result.ok ? result.code : "failed");
        return;
      }
      setReview(result.review);
      if (result.review.status === "processing" && count < MAX_POLLS) {
        timer = setTimeout(load, POLL_INTERVAL_MS);
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [documentId]);

  if (loadError) {
    return <Notice tone="danger" onClose={onClose} t={t}>{errorMessage(loadError, t, true)}</Notice>;
  }

  if (!review || review.status === "processing") {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center" aria-live="polite">
        <Loader2Icon size={28} className="animate-spin text-info" aria-hidden />
        <p className="text-sm font-medium text-text-primary">{t.reading}</p>
        <p className="text-xs text-text-muted">{polls >= SLOW_AFTER_POLLS ? t.slow : t.readingHint}</p>
        {polls >= SLOW_AFTER_POLLS && (
          <Button type="button" variant="secondary" onClick={onClose}>
            {t.later}
          </Button>
        )}
      </div>
    );
  }

  if (review.status === "failed") return <Notice tone="danger" onClose={onClose} t={t}>{t.failed}</Notice>;
  if (review.status === "no_draft") return <Notice tone="info" onClose={onClose} t={t}>{t.noDraft}</Notice>;
  if (review.status === "confirmed") {
    return <Saved transactionId={review.transactionId} message={t.confirmed} onClose={onClose} t={t} />;
  }

  return <ReceiptReviewForm review={review} onClose={onClose} t={t} locale={locale} />;
}

interface ItemRow {
  key: string;
  name: string;
  quantity: string;
  unitPrice: string;
  totalPrice: string;
}

function ReceiptReviewForm({
  review,
  onClose,
  t,
  locale,
}: {
  review: ReceiptReview;
  onClose: () => void;
  t: ReceiptDict;
  locale: Locale;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedTransactionId, setSavedTransactionId] = useState<string | null>(null);

  const [vendorName, setVendorName] = useState(review.merchantName ?? "");
  const [merchantTaxId, setMerchantTaxId] = useState(review.merchantTaxId ?? "");
  const [transactionDate, setTransactionDate] = useState(review.transactionDate ?? today());
  const [currency, setCurrency] = useState((review.currency ?? "EUR").toUpperCase());
  const [total, setTotal] = useState(review.total != null ? String(review.total) : "");
  const keySeq = useRef(0);
  const nextKey = useCallback(() => `row-${(keySeq.current += 1)}`, []);
  const [items, setItems] = useState<ItemRow[]>(() =>
    review.items.map((item, index) => ({
      key: `item-${index}`,
      name: item.name,
      quantity: item.quantity != null ? String(item.quantity) : "",
      unitPrice: item.unitPrice != null ? String(item.unitPrice) : "",
      totalPrice: item.totalPrice != null ? String(item.totalPrice) : "",
    })),
  );
  const [categoryId, setCategoryId] = useState(review.categoryId ?? "");
  const [contextId, setContextId] = useState(review.expenseContextId ?? "");
  const [rememberChoice, setRememberChoice] = useState(false);

  const accounts = useMemo(
    () => review.accounts.filter((account) => account.currency === currency),
    [review.accounts, currency],
  );
  const [accountChoice, setAccountChoice] = useState("");
  const accountId = accounts.some((account) => account.id === accountChoice) ? accountChoice : (accounts[0]?.id ?? "");

  const money = useCallback(
    (amount: number) => {
      try {
        return new Intl.NumberFormat(INTL_LOCALE[locale], { style: "currency", currency }).format(amount);
      } catch {
        return `${amount.toFixed(2)} ${currency}`;
      }
    },
    [currency, locale],
  );

  const itemsSum = round2(items.reduce((sum, item) => sum + (toNumber(item.totalPrice) ?? 0), 0));
  const totalNumber = toNumber(total);
  const itemsDisagree = items.some((item) => toNumber(item.totalPrice) != null) && totalNumber != null && Math.abs(itemsSum - totalNumber) > 0.01;

  const validItems = items.every((item) => item.name.trim().length > 0);
  const canSave =
    !pending &&
    vendorName.trim().length > 0 &&
    /^[A-Za-z]{3}$/.test(currency) &&
    totalNumber != null &&
    totalNumber > 0 &&
    Boolean(transactionDate) &&
    Boolean(accountId) &&
    validItems;

  function updateItem(key: string, patch: Partial<ItemRow>) {
    setItems((rows) =>
      rows.map((row) => {
        if (row.key !== key) return row;
        const next = { ...row, ...patch };
        // Quantity × unit price fills the line amount; a typed amount is kept.
        if (("quantity" in patch || "unitPrice" in patch) && !("totalPrice" in patch)) {
          const quantity = toNumber(next.quantity);
          const unitPrice = toNumber(next.unitPrice);
          if (quantity != null && unitPrice != null) next.totalPrice = String(round2(quantity * unitPrice));
        }
        return next;
      }),
    );
  }

  function save() {
    setError(null);
    start(async () => {
      const result = await saveReviewedReceiptAction({
        documentId: review.documentId,
        suggestionId: review.suggestionId,
        vendorName,
        merchantTaxId: merchantTaxId || null,
        transactionDate,
        currency,
        amount: totalNumber,
        items: items.map((item) => ({
          name: item.name,
          quantity: toNumber(item.quantity),
          unitPrice: toNumber(item.unitPrice),
          totalPrice: toNumber(item.totalPrice),
        })),
        accountId,
        categoryId: categoryId || null,
        expenseContextId: contextId || null,
        rememberChoice: rememberChoice && Boolean(categoryId && contextId),
      }).catch(() => null);
      if (!result || !result.ok) {
        setError(errorMessage(result && !result.ok ? result.code : "failed", t, false));
        return;
      }
      setSavedTransactionId(result.transactionId);
      router.refresh();
    });
  }

  function reject() {
    if (!review.suggestionId) return;
    setError(null);
    start(async () => {
      const result = await rejectFinancialSuggestion({ suggestionId: review.suggestionId }).catch(() => null);
      if (!result || !result.ok) {
        setError(t.errors.failed);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  if (savedTransactionId) {
    return <Saved transactionId={savedTransactionId} message={t.saved} onClose={onClose} t={t} />;
  }

  const mismatch = new Set(review.codeMismatches);
  const inputClass =
    "mt-1 w-full rounded-(--neu-radius-sm) border border-border bg-surface px-3 py-2 text-sm text-text-primary disabled:opacity-60";
  const flagged = "border-accent-yellow ring-1 ring-accent-yellow/40";

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSave) save();
      }}
    >
      <div className="flex flex-col gap-4 sm:flex-row">
        {review.photoUrl && (
          <a
            href={review.photoUrl}
            target="_blank"
            rel="noreferrer"
            className="mx-auto block h-40 w-32 shrink-0 overflow-hidden rounded-(--neu-radius-md) bg-surface-sunken sm:mx-0"
          >
            <Image src={review.photoUrl} alt={t.photoAlt} width={128} height={160} unoptimized className="h-full w-full object-cover" />
          </a>
        )}
        <div className="grid flex-1 grid-cols-2 gap-3">
          <Field label={t.issuer} htmlFor="receipt-issuer" className="col-span-2">
            <input id="receipt-issuer" value={vendorName} onChange={(e) => setVendorName(e.target.value)} maxLength={240} required disabled={pending} className={inputClass} />
          </Field>
          <Field label={t.taxId} htmlFor="receipt-tax-id">
            <input id="receipt-tax-id" value={merchantTaxId} onChange={(e) => setMerchantTaxId(e.target.value)} maxLength={64} disabled={pending} className={inputClass} />
          </Field>
          <Field label={t.date} htmlFor="receipt-date">
            <input id="receipt-date" type="date" value={transactionDate} onChange={(e) => setTransactionDate(e.target.value)} required disabled={pending} className={cn(inputClass, mismatch.has("date") && flagged)} />
          </Field>
          <Field label={t.total} htmlFor="receipt-total">
            <input id="receipt-total" type="number" inputMode="decimal" min="0.01" step="0.01" value={total} onChange={(e) => setTotal(e.target.value)} required disabled={pending} className={cn(inputClass, "font-semibold", mismatch.has("amount") && flagged)} />
          </Field>
          <Field label={t.currency} htmlFor="receipt-currency">
            <input id="receipt-currency" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))} maxLength={3} required disabled={pending} className={cn(inputClass, "uppercase", mismatch.has("currency") && flagged)} />
          </Field>
        </div>
      </div>

      {review.scanned && mismatch.size === 0 && (
        <p className="flex items-center gap-2 text-xs text-accent-green">
          <QrCodeIcon size={14} aria-hidden /> {t.scanned}
        </p>
      )}
      {mismatch.size > 0 && (
        <Banner>{t.codeMismatch.replace("{fields}", [...mismatch].map((field) => t.mismatchFields[field]).join(", "))}</Banner>
      )}
      {review.possibleDuplicate && <Banner>{t.duplicate}</Banner>}

      <section>
        <h3 className="text-sm font-semibold text-text-secondary">{t.items}</h3>
        {items.length === 0 && <p className="mt-2 text-xs text-text-muted">{t.noItems}</p>}
        {/* Desktop column headings; on mobile each input carries its own label. */}
        {items.length > 0 && (
          <div aria-hidden className="mt-2 hidden grid-cols-[minmax(0,3fr)_4.5rem_6rem_6rem_2.25rem] gap-2 px-2 text-[11px] font-medium uppercase tracking-wide text-text-muted md:grid">
            <span>{t.itemName}</span>
            <span className="text-right">{t.quantity}</span>
            <span className="text-right">{t.unitPrice}</span>
            <span className="text-right">{t.lineTotal}</span>
          </div>
        )}
        <ul className="mt-2 flex flex-col gap-2">
          {items.map((item) => (
            <li
              key={item.key}
              className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2 rounded-(--neu-radius-md) bg-surface-sunken p-2 md:grid-cols-[minmax(0,3fr)_4.5rem_6rem_6rem_2.25rem]"
            >
              <label className="col-span-4 md:col-span-1">
                <span className="sr-only">{t.itemName}</span>
                <input value={item.name} onChange={(e) => updateItem(item.key, { name: e.target.value })} placeholder={t.itemName} maxLength={240} required disabled={pending} className={cn(inputClass, "mt-0")} />
              </label>
              <label>
                <span className="text-[11px] text-text-muted md:sr-only">{t.quantity}</span>
                <input type="number" inputMode="decimal" min="0" step="any" value={item.quantity} onChange={(e) => updateItem(item.key, { quantity: e.target.value })} placeholder={t.quantity} aria-label={t.quantity} disabled={pending} className={cn(inputClass, "mt-0 px-2 text-right")} />
              </label>
              <label>
                <span className="text-[11px] text-text-muted md:sr-only">{t.unitPrice}</span>
                <input type="number" inputMode="decimal" min="0" step="0.01" value={item.unitPrice} onChange={(e) => updateItem(item.key, { unitPrice: e.target.value })} placeholder={t.unitPrice} aria-label={t.unitPrice} disabled={pending} className={cn(inputClass, "mt-0 px-2 text-right")} />
              </label>
              <label>
                <span className="text-[11px] text-text-muted md:sr-only">{t.lineTotal}</span>
                <input type="number" inputMode="decimal" min="0" step="0.01" value={item.totalPrice} onChange={(e) => updateItem(item.key, { totalPrice: e.target.value })} placeholder={t.lineTotal} aria-label={t.lineTotal} disabled={pending} className={cn(inputClass, "mt-0 px-2 text-right")} />
              </label>
              <button
                type="button"
                onClick={() => setItems((rows) => rows.filter((row) => row.key !== item.key))}
                aria-label={`${t.removeItem}: ${item.name}`}
                disabled={pending}
                className="cursor-pointer rounded-(--neu-radius-sm) p-2 text-text-muted hover:bg-surface hover:text-danger"
              >
                <Trash2Icon size={16} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setItems((rows) => [...rows, { key: nextKey(), name: "", quantity: "1", unitPrice: "", totalPrice: "" }])}
          disabled={pending}
          className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-(--neu-radius-sm) px-2 py-1.5 text-sm font-medium text-info hover:bg-info-soft"
        >
          <PlusIcon size={15} aria-hidden /> {t.addItem}
        </button>
        {itemsDisagree && totalNumber != null && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-accent-yellow">
            <AlertTriangleIcon size={14} aria-hidden />
            <span>{t.itemsMismatch.replace("{sum}", money(itemsSum)).replace("{total}", money(totalNumber))}</span>
            <button type="button" onClick={() => setTotal(String(itemsSum))} className="cursor-pointer font-semibold underline">
              {t.useItemsSum}
            </button>
          </div>
        )}
      </section>

      <div className="grid gap-3 rounded-(--neu-radius-md) border border-border bg-surface-sunken p-3 sm:grid-cols-2">
        <Field label={t.account} htmlFor="receipt-account" className="sm:col-span-2">
          {accounts.length > 0 ? (
            <select id="receipt-account" value={accountId} onChange={(e) => setAccountChoice(e.target.value)} disabled={pending} className={inputClass}>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{account.name}</option>
              ))}
            </select>
          ) : (
            <p id="receipt-account" className="mt-1 text-sm text-accent-yellow">
              {t.noAccount.replace("{currency}", currency)}{" "}
              <Link href={ROUTES.money} className="font-semibold underline">{t.openTransaction}</Link>
            </p>
          )}
        </Field>
        {review.categories.length > 0 && (
          <Field label={t.category} htmlFor="receipt-category">
            <select id="receipt-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={pending} className={inputClass}>
              <option value="">—</option>
              {review.categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </Field>
        )}
        {review.contexts.length > 0 && (
          <Field label={t.context} htmlFor="receipt-context">
            <select id="receipt-context" value={contextId} onChange={(e) => setContextId(e.target.value)} disabled={pending} className={inputClass}>
              <option value="">—</option>
              {review.contexts.map((context) => (
                <option key={context.id} value={context.id}>
                  {context.name}{context.visibility === "private" ? ` · ${t.privateSuffix}` : ""}
                </option>
              ))}
            </select>
          </Field>
        )}
        {categoryId && contextId && (
          <label className="flex items-center gap-2 text-sm text-text-secondary sm:col-span-2">
            <input type="checkbox" checked={rememberChoice} onChange={(e) => setRememberChoice(e.target.checked)} disabled={pending} className="h-4 w-4 rounded border-border" />
            {t.remember}
          </label>
        )}
      </div>

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button type="button" variant="secondary" onClick={reject} disabled={pending} className="text-danger">
          {t.reject}
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            {t.later}
          </Button>
          <Button type="submit" isLoading={pending} disabled={!canSave}>
            {pending ? t.saving : t.save}
          </Button>
        </div>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="text-xs font-medium uppercase tracking-wide text-text-muted">
        {label}
      </label>
      {children}
    </div>
  );
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-(--neu-radius-md) border border-accent-yellow/30 bg-accent-yellow-soft px-3 py-2.5 text-sm text-neutral-900">
      <AlertTriangleIcon size={16} className="mt-0.5 shrink-0 text-accent-yellow" aria-hidden />
      <span>{children}</span>
    </div>
  );
}

function Notice({
  tone,
  onClose,
  t,
  children,
}: {
  tone: "info" | "danger";
  onClose: () => void;
  t: ReceiptDict;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      <p className={cn("text-sm", tone === "danger" ? "text-danger" : "text-text-secondary")}>{children}</p>
      <Button type="button" variant="secondary" onClick={onClose}>
        {t.close}
      </Button>
    </div>
  );
}

function Saved({
  transactionId,
  message,
  onClose,
  t,
}: {
  transactionId: string | null;
  message: string;
  onClose: () => void;
  t: ReceiptDict;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      <CheckCircle2Icon size={32} className="text-accent-green" aria-hidden />
      <p className="text-sm font-medium text-text-primary">{message}</p>
      <div className="flex gap-2">
        {transactionId && (
          <Link
            href={`${ROUTES.money}/${transactionId}`}
            className="inline-flex items-center rounded-lg bg-accent-green px-4 py-2 text-sm font-semibold text-text-inverse hover:opacity-90"
          >
            {t.openTransaction}
          </Link>
        )}
        <Button type="button" variant="secondary" onClick={onClose}>
          {t.close}
        </Button>
      </div>
    </div>
  );
}

function errorMessage(code: ReceiptReviewErrorCode, t: ReceiptDict, loading: boolean): string {
  switch (code) {
    case "forbidden":
      return t.errors.forbidden;
    case "invalid":
      return loading ? t.errors.load : t.errors.invalid;
    case "not_found":
      return t.errors.notFound;
    case "handled":
      return t.errors.handled;
    case "currency_mismatch":
      return t.errors.currencyMismatch;
    default:
      return loading ? t.errors.load : t.errors.failed;
  }
}

function toNumber(value: string): number | null {
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed) return null;
  const number = Number(trimmed);
  return Number.isFinite(number) ? number : null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
