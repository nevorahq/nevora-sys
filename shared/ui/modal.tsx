"use client";

import { useEffect, useRef } from "react";
import { XIcon } from "lucide-react";
import { cn } from "@/shared/utils/cn";

/**
 * Modal — переиспользуемое модальное окно.
 *
 * Использует нативный <dialog> элемент:
 * - Встроенный backdrop (overlay)
 * - Нативный focus trap (Tab не выходит за пределы модалки)
 * - Закрытие по Escape из коробки
 * - Accessibility (role="dialog", aria-modal) — бесплатно
 * - 0 зависимостей
 *
 * Почему <dialog>, а не div + portal:
 * - Меньше кода (не нужен createPortal, focus trap, scroll lock)
 * - Лучше accessibility (браузер делает за тебя)
 * - Стандарт HTML — работает без JS (progressive enhancement)
 */
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  closeLabel?: string;
  children: React.ReactNode;
}

export function Modal({ isOpen, onClose, title, closeLabel = "Close", children }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
      document.body.style.overflow = "hidden";
    } else if (!isOpen && dialog.open) {
      dialog.close();
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Закрытие по клику на backdrop (область за пределами модалки)
  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) {
      onClose();
    }
  }

  // Обработка нативного close (Escape)
  function handleClose() {
    onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={handleClose}
      onClick={handleBackdropClick}
      className={cn(
        // Reset browser dialog styles
        "fixed inset-0 m-auto p-0 border-none bg-transparent",
        "max-h-[90vh] max-w-2xl w-[calc(100%-2rem)]",
        // Backdrop
        "backdrop:bg-black/40 backdrop:backdrop-blur-sm",
        // Animation
        "open:animate-in open:fade-in-0 open:zoom-in-95",
      )}
    >
      <div className="soft-card p-6 max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="soft-icon-button w-8 h-8"
          >
            <XIcon size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Content */}
        {children}
      </div>
    </dialog>
  );
}
