import { cn } from "@/shared/utils/cn";

const STATUS_MAP: Record<string, { bg: string; text: string; label: string }> = {
  // Client statuses
  lead:     { bg: "bg-info-soft",          text: "text-info",           label: "Lead" },
  prospect: { bg: "bg-accent-yellow-soft", text: "text-text-primary",   label: "Prospect" },
  customer: { bg: "bg-accent-green-soft",  text: "text-text-primary",   label: "Customer" },
  churned:  { bg: "bg-surface-sunken",     text: "text-text-muted",     label: "Churned" },
  // Deal statuses
  open:     { bg: "bg-info-soft",          text: "text-info",           label: "Open" },
  won:      { bg: "bg-accent-green-soft",  text: "text-text-primary",   label: "Won" },
  lost:     { bg: "bg-danger-soft",        text: "text-danger",         label: "Lost" },
  // Activity types
  call:     { bg: "bg-accent-lilac-soft",  text: "text-text-primary",   label: "Call" },
  email:    { bg: "bg-info-soft",          text: "text-info",           label: "Email" },
  meeting:  { bg: "bg-accent-yellow-soft", text: "text-text-primary",   label: "Meeting" },
  task:     { bg: "bg-surface-sunken",     text: "text-text-secondary", label: "Task" },
  note:     { bg: "bg-accent-pink-soft",   text: "text-text-primary",   label: "Note" },
  // Misc
  primary:  { bg: "bg-accent-green-soft",  text: "text-text-primary",   label: "Primary" },
};

interface CRMStatusBadgeProps {
  status: string;
  className?: string;
}

export function CRMStatusBadge({ status, className }: CRMStatusBadgeProps) {
  const s = STATUS_MAP[status];
  return (
    <span
      className={cn(
        "soft-badge capitalize",
        s ? `${s.bg} ${s.text}` : "bg-surface-sunken text-text-muted",
        className,
      )}
    >
      {s ? s.label : status}
    </span>
  );
}
