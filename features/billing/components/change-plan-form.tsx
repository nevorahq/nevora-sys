import { Button } from "@/shared/ui/button";

interface ChangePlanFormProps {
  planName: string;
}

export function ChangePlanForm({ planName }: ChangePlanFormProps) {
  return (
    <div className="mt-auto pt-4">
      <Button
        type="button"
        disabled
        aria-label={`${planName} plan is temporarily unavailable`}
        className="w-full rounded-lg border border-border py-1.5 text-xs font-medium text-text-secondary"
      >
        Coming soon
      </Button>
      <p className="mt-2 text-center text-xs text-text-muted">
        Plan changes are temporarily unavailable.
      </p>
    </div>
  );
}
