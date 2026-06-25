"use client";

import { useState, useRef, useEffect } from "react";
import { MoreHorizontalIcon } from "lucide-react";
import { cn } from "@/shared/utils/cn";

interface CRMRowMenuProps {
  id: string;
}

export function CRMRowMenu({ id: _ }: CRMRowMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((p) => !p);
        }}
        className="soft-icon-button h-7 w-7"
        aria-label="Row actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontalIcon size={14} aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            "absolute right-0 top-full z-20 mt-1 w-36",
            "rounded-(--neu-radius-md) border border-border-soft bg-surface shadow-neu-card",
            "overflow-hidden py-1",
          )}
        >
          <button
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex w-full items-center px-3 py-2 text-left text-sm text-text-secondary hover:bg-surface-sunken hover:text-text-primary transition-colors"
          >
            Edit
          </button>
          <button
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex w-full items-center px-3 py-2 text-left text-sm text-danger hover:bg-danger-soft transition-colors"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
