"use client";

import {
  Children,
  type CSSProperties,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { EllipsisVerticalIcon } from "lucide-react";
import { cn } from "@/shared/utils/cn";

interface HeaderActionsProps {
  children: ReactNode;
  label: string;
}

const ACTION_SIZE_PX = 36;
const ACTION_GAP_PX = 8;
const STAGGER_MS = 45;

/**
 * Collapses header controls behind one action button on every viewport. Each
 * control starts under the trigger and moves into its final position from
 * right to left.
 */
export function HeaderActions({ children, label }: HeaderActionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const actionsId = useId();
  const actions = Children.toArray(children);
  const rootStyle = {
    "--header-actions-width": `${actions.length * (ACTION_SIZE_PX + ACTION_GAP_PX) + ACTION_SIZE_PX}px`,
  } as CSSProperties;

  useEffect(() => {
    if (!isOpen) return;

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setIsOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  return (
    <div
      ref={rootRef}
      style={rootStyle}
      data-testid="header-actions"
      data-state={isOpen ? "open" : "closed"}
      className={cn(
        "relative flex h-9 shrink-0 items-center justify-end transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        isOpen ? "w-[var(--header-actions-width)]" : "w-9",
      )}
    >
      <div
        id={actionsId}
        role="group"
        aria-label={label}
        className={cn(
          "absolute right-11 top-0 z-20 flex w-max items-center gap-2",
          !isOpen && "pointer-events-none",
        )}
      >
        {actions.map((action, index) => {
          const distance = (actions.length - index) * (ACTION_SIZE_PX + ACTION_GAP_PX);
          const delay = isOpen
            ? (actions.length - index - 1) * STAGGER_MS
            : index * STAGGER_MS;
          const style = {
            "--header-action-offset": `${distance}px`,
            transitionDelay: `${delay}ms`,
          } as CSSProperties;

          return (
            <div
              key={index}
              data-testid="header-action-item"
              style={style}
              className={cn(
                "relative shrink-0 transition-[transform,opacity,visibility] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                isOpen
                  ? "visible transform-none opacity-100"
                  : "invisible translate-x-[var(--header-action-offset)] scale-90 opacity-0",
              )}
            >
              {action}
            </div>
          );
        })}
      </div>

      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        title={label}
        aria-controls={actionsId}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className="soft-icon-button relative z-30 h-9 w-9"
      >
        <EllipsisVerticalIcon
          aria-hidden="true"
          size={18}
          strokeWidth={1.75}
          className={cn(
            "transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
            isOpen && "rotate-90",
          )}
        />
      </button>
    </div>
  );
}
