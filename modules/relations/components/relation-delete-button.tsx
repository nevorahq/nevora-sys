"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2Icon } from "lucide-react";
import { deleteEntityRelation } from "../actions/delete-relation.action";

interface RelationDeleteButtonProps {
  relationId: string;
  revalidate?: string;
}

/** Иконочная кнопка soft-delete связи. */
export function RelationDeleteButton({ relationId, revalidate }: RelationDeleteButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const res = await deleteEntityRelation({ relationId }, revalidate);
      if (res.ok) router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={isPending}
      aria-label="Remove link"
      className="shrink-0 rounded-full p-1.5 text-text-muted transition-colors hover:bg-accent-pink-soft hover:text-accent-pink disabled:opacity-50"
    >
      <Trash2Icon size={14} />
    </button>
  );
}
