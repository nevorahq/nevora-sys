import Link from "next/link";
import { cn } from "@/shared/utils/cn";

export type CRMSection = "leads" | "contacts" | "clients" | "deals" | "activities";

const SECTIONS: { id: CRMSection; label: string }[] = [
  { id: "leads",      label: "Leads" },
  { id: "contacts",   label: "Contacts" },
  { id: "clients",    label: "Clients" },
  { id: "deals",      label: "Deals" },
  { id: "activities", label: "Activities" },
];

interface CRMSectionTabsProps {
  activeSection: CRMSection;
}

export function CRMSectionTabs({ activeSection }: CRMSectionTabsProps) {
  return (
    <div
      className="flex gap-1.5 overflow-x-auto pb-0.5"
      style={{ scrollbarWidth: "none" }}
      role="tablist"
      aria-label="CRM sections"
    >
      {SECTIONS.map((s) => {
        const active = activeSection === s.id;
        return (
          <Link
            key={s.id}
            href={`/dashboard/crm?section=${s.id}`}
            role="tab"
            aria-selected={active}
            aria-controls={`crm-panel-${s.id}`}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-(--neu-radius-pill) px-4 py-1.5 text-sm font-medium transition-all duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
              active
                ? "bg-text-primary text-text-inverse shadow-neu-sm pointer-events-none"
                : "bg-surface text-text-secondary border border-border-soft shadow-neu-control hover:text-text-primary hover:shadow-neu-sm",
            )}
          >
            {s.label}
          </Link>
        );
      })}
    </div>
  );
}
