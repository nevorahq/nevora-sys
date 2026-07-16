"use client";

import { useState, useTransition } from "react";
import { CheckIcon, XIcon } from "lucide-react";
import { confirmRelation, rejectRelation } from "../actions/review-relation.action";

export function RelationReviewButtons({
  relationId,
  revalidate,
  confirmTitle = "Confirm relation",
  rejectTitle = "Reject relation",
}: {
  relationId: string;
  revalidate?: string;
  confirmTitle?: string;
  rejectTitle?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: "confirm" | "reject") {
    setError(null);
    startTransition(async () => {
      const res =
        action === "confirm"
          ? await confirmRelation({ relationId }, revalidate)
          : await rejectRelation({ relationId }, revalidate);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        title={confirmTitle}
        disabled={pending}
        onClick={() => run("confirm")}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-success-soft text-success hover:opacity-80 disabled:opacity-50"
      >
        <CheckIcon size={14} />
      </button>
      <button
        type="button"
        title={rejectTitle}
        disabled={pending}
        onClick={() => run("reject")}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-danger-soft text-danger hover:opacity-80 disabled:opacity-50"
      >
        <XIcon size={14} />
      </button>
      {error && <span className="sr-only" role="alert">{error}</span>}
    </div>
  );
}
