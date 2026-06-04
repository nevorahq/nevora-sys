import { forwardRef } from "react";
import { cn } from "@/shared/utils/cn";

type InputProps = React.ComponentProps<"input"> & {
  label?: string;
  error?: string;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={id}
            className="text-sm font-medium text-text-secondary"
          >
            {label}
          </label>
        )}
        <input
          id={id}
          ref={ref}
          className={cn(
            "soft-control",
            "w-full px-4 py-2.5 text-sm",
            error && "border-danger! focus:ring-danger!",
            className,
          )}
          {...props}
        />
        {error && (
          <p className="text-xs font-medium text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";
