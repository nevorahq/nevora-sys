import { forwardRef } from "react";
import { cn } from "@/shared/utils/cn";

/**
 * Neumorphic Checkbox.
 *
 * Использует inset-shadow когда checked (нажатое состояние)
 * и raised-shadow когда unchecked. Это neumorphic-паттерн:
 * checked = вдавлено, unchecked = выпукло.
 */
type CheckboxProps = Omit<React.ComponentProps<"input">, "type"> & {
  label?: string;
};

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, id, ...props }, ref) => {
    return (
      <label
        htmlFor={id}
        className="inline-flex cursor-pointer items-center gap-2.5 select-none"
      >
        <input
          id={id}
          ref={ref}
          type="checkbox"
          className={cn(
            "peer sr-only", // визуально скрыт, кастомный вид ниже
            className,
          )}
          {...props}
        />
        {/* Кастомный чекбокс */}
        <span
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-(--neu-radius-sm)",
            "border border-border-soft bg-surface-sunken",
            "shadow-neu-inset",
            "transition-all duration-150",
            "peer-checked:bg-accent-green peer-checked:border-accent-green peer-checked:shadow-none",
            "peer-focus-visible:ring-2 peer-focus-visible:ring-focus-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background",
          )}
        >
          {/* Галочка — появляется через peer-checked */}
          <svg
            className="h-3 w-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </span>
        {label && (
          <span className="text-sm text-text-secondary peer-checked:text-text-muted peer-checked:line-through">
            {label}
          </span>
        )}
      </label>
    );
  },
);

Checkbox.displayName = "Checkbox";
