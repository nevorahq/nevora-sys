"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MenuIcon, XIcon } from "lucide-react";
import { ROUTES } from "@/shared/config/routes";
import type { LandingContent } from "../constants/landing-content";

interface LandingMobileNavProps {
  nav: LandingContent["nav"];
  header: LandingContent["header"];
  menuLabel: string;
  closeLabel: string;
}

/**
 * Мобильное меню лендинга (< md). Полноценная навигация: anchor-ссылки + вход +
 * основной CTA. На десктопе скрыто — там обычный горизонтальный nav в хедере.
 */
export function LandingMobileNav({ nav, header, menuLabel, closeLabel }: LandingMobileNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={isOpen ? closeLabel : menuLabel}
        onClick={() => setIsOpen((value) => !value)}
        className="soft-focus inline-flex h-11 w-11 items-center justify-center rounded-(--neu-radius-pill) border border-border-soft bg-surface text-text-secondary shadow-neu-control transition-colors hover:text-text-primary"
      >
        {isOpen ? (
          <XIcon size={20} strokeWidth={1.9} aria-hidden="true" />
        ) : (
          <MenuIcon size={20} strokeWidth={1.9} aria-hidden="true" />
        )}
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 top-16 z-40 bg-background/40 backdrop-blur-sm"
            aria-hidden="true"
            onClick={() => setIsOpen(false)}
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-label={menuLabel}
            className="absolute inset-x-0 top-[calc(100%+1px)] z-50 border-b border-border-soft bg-surface-elevated p-4 shadow-neu-card"
          >
            <nav className="flex flex-col gap-1" aria-label="Primary mobile">
              {nav.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsOpen(false)}
                  className="soft-focus flex min-h-11 items-center rounded-(--neu-radius-md) px-3 text-base font-medium text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
                >
                  {link.label}
                </a>
              ))}
            </nav>

            <div className="mt-3 flex flex-col gap-2 border-t border-border-soft pt-3">
              <Link
                href={ROUTES.login}
                onClick={() => setIsOpen(false)}
                className="soft-focus inline-flex min-h-11 items-center justify-center rounded-(--neu-radius-pill) border border-border-soft bg-surface px-4 text-sm font-semibold text-text-primary shadow-neu-control"
              >
                {header.login}
              </Link>
              <Link
                href={ROUTES.register}
                onClick={() => setIsOpen(false)}
                className="soft-focus inline-flex min-h-11 items-center justify-center rounded-(--neu-radius-pill) bg-text-primary px-4 text-sm font-semibold text-text-inverse shadow-neu-control"
              >
                {header.cta}
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
