import { forwardRef } from "react";
import { cn } from "@/shared/utils/cn";

/**
 * Neumorphic Select — стилизованный <select>.
 * Использует soft-control как базу (inset shadow, sunken background).
 */
type SelectProps = React.ComponentProps<"select"> & {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, id, options, ...props }, ref) => {
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
        <select
          id={id}
          ref={ref}
          className={cn(
            "soft-control",
            "w-full px-4 py-2.5 text-sm appearance-none",
            "bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%236F6E70%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')]",
            "bg-[length:1rem] bg-[position:right_0.75rem_center] bg-no-repeat pr-10",
            error && "border-danger! focus:ring-danger!",
            className,
          )}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && (
          <p className="text-xs font-medium text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  },
);

Select.displayName = "Select";
