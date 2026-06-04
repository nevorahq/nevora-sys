import { forwardRef } from "react";
import { cn } from "@/shared/utils/cn";

type ButtonProps = React.ComponentProps<"button"> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  isLoading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", isLoading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          "inline-flex items-center justify-center gap-2",
          "rounded-(--neu-radius-pill) px-5 py-2.5",
          "text-sm font-semibold leading-none tracking-wide",
          "transition-all duration-150",
          "focus-visible:outline-none",
          "disabled:pointer-events-none disabled:opacity-50",

          variant === "primary" && [
            "bg-text-primary text-text-inverse",
            "shadow-neu-control",
            "hover:shadow-neu-card",
            "active:shadow-neu-inset active:scale-[0.98]",
            "focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          ],

          variant === "secondary" && [
            "bg-surface text-text-primary",
            "border border-border-soft",
            "shadow-neu-control",
            "hover:shadow-neu-card hover:border-border-strong",
            "active:shadow-neu-inset active:scale-[0.98]",
            "focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          ],

          variant === "danger" && [
            "bg-danger text-white",
            "shadow-neu-control",
            "hover:opacity-90 hover:shadow-neu-card",
            "active:shadow-neu-inset active:scale-[0.98]",
            "focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          ],

          variant === "ghost" && [
            "bg-transparent text-text-secondary",
            "hover:bg-surface hover:text-text-primary hover:shadow-neu-sm",
            "active:shadow-neu-inset active:scale-[0.98]",
            "focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          ],

          className,
        )}
        {...props}
      >
        {isLoading ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <span>{children}</span>
          </>
        ) : (
          children
        )}
      </button>
    );
  },
);

Button.displayName = "Button";
