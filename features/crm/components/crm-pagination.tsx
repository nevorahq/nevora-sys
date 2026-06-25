"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import type { CRMSection } from "./crm-section-tabs";

interface CRMPaginationProps {
  section: CRMSection;
  currentSearch: string;
  currentStatus: string;
  currentOwner: string;
  currentPage: number;
  totalCount: number;
  pageSize: number;
}

export function CRMPagination({
  section,
  currentSearch,
  currentStatus,
  currentOwner,
  currentPage,
  totalCount,
  pageSize,
}: CRMPaginationProps) {
  const router = useRouter();
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const start = Math.min((currentPage - 1) * pageSize + 1, totalCount);
  const end = Math.min(currentPage * pageSize, totalCount);

  const goTo = useCallback(
    (page: number) => {
      const params = new URLSearchParams();
      params.set("section", section);
      if (currentSearch) params.set("search", currentSearch);
      if (currentStatus) params.set("status", currentStatus);
      if (currentOwner) params.set("owner", currentOwner);
      if (page > 1) params.set("page", String(page));
      router.push(`/dashboard/crm?${params.toString()}`);
    },
    [router, section, currentSearch, currentStatus, currentOwner],
  );

  if (totalPages <= 1 && totalCount <= pageSize) return null;

  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1).reduce<
    (number | "…")[]
  >((acc, p, i, arr) => {
    if (
      p === 1 ||
      p === totalPages ||
      Math.abs(p - currentPage) <= 1
    ) {
      if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push("…");
      acc.push(p);
    }
    return acc;
  }, []);

  return (
    <div className="flex items-center justify-between gap-4 pt-3">
      <p className="text-xs text-text-muted">
        {totalCount > 0 ? `${start}–${end} of ${totalCount}` : "No results"}
      </p>

      <div className="flex items-center gap-1">
        <button
          onClick={() => goTo(currentPage - 1)}
          disabled={currentPage <= 1}
          className="soft-icon-button h-8 w-8 disabled:opacity-40 disabled:pointer-events-none"
          aria-label="Previous page"
        >
          <ChevronLeftIcon size={14} aria-hidden />
        </button>

        {pageNumbers.map((p, i) =>
          p === "…" ? (
            <span key={`ellipsis-${i}`} className="px-1 text-xs text-text-muted select-none">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => goTo(p as number)}
              className={cn(
                "h-8 min-w-[2rem] rounded-(--neu-radius-pill) px-2.5 text-xs font-medium transition-all",
                p === currentPage
                  ? "bg-text-primary text-text-inverse shadow-neu-sm pointer-events-none"
                  : "bg-surface text-text-secondary border border-border-soft shadow-neu-control hover:shadow-neu-sm",
              )}
              aria-label={`Page ${p}`}
              aria-current={p === currentPage ? "page" : undefined}
            >
              {p}
            </button>
          ),
        )}

        <button
          onClick={() => goTo(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="soft-icon-button h-8 w-8 disabled:opacity-40 disabled:pointer-events-none"
          aria-label="Next page"
        >
          <ChevronRightIcon size={14} aria-hidden />
        </button>
      </div>
    </div>
  );
}
