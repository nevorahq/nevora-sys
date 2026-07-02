"use client";

import { useState, useTransition } from "react";
import { SparklesIcon } from "lucide-react";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { answerExpenseQuestionAction } from "../actions/answer-expense-question.action";

interface ExpenseQuestionProps {
  labels: Dictionary["money"]["question"];
  /** Selected-month window so answers follow the history navigator. */
  month: { monthStart: string; nextMonthStart: string; label: string };
}

export function ExpenseQuestion({ labels, month }: ExpenseQuestionProps) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await answerExpenseQuestionAction(question, month);
      setAnswer(result.answer ?? null);
      setError(result.error ?? null);
    });
  }

  return (
    <section className="mt-8 soft-card p-5">
      <div className="flex items-center gap-2">
        <SparklesIcon size={18} className="text-text-secondary" />
        <h2 className="font-semibold text-text-primary">{labels.title}</h2>
      </div>
      <p className="mt-1 text-sm text-text-muted">{labels.hint}</p>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          maxLength={300}
          placeholder={labels.placeholder}
          className="soft-control min-h-11 flex-1 px-4 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={pending || question.trim().length < 3}
          className="min-h-11 rounded-lg bg-text-primary px-4 text-sm font-semibold text-text-inverse disabled:opacity-50"
        >
          {pending ? labels.calculating : labels.calculate}
        </button>
      </form>
      {answer && <p className="mt-4 rounded-(--neu-radius-md) bg-surface-sunken p-3 text-sm text-text-primary">{answer}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
    </section>
  );
}
