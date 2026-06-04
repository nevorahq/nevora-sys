import { cn } from "@/shared/utils/cn";

type CardProps = React.ComponentProps<"div"> & {
  size?: "sm" | "md" | "lg";
};

export function Card({ className, size = "md", children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        size === "sm" && "soft-card-sm p-4",
        size === "md" && "soft-card p-6",
        size === "lg" && "soft-card-lg p-8",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
