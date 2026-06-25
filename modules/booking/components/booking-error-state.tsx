import { AlertCircleIcon } from "lucide-react";

interface BookingErrorStateProps {
  title: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export function BookingErrorState({
  title,
  message,
  onRetry,
  retryLabel = "Try again",
}: BookingErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-danger-soft">
        <AlertCircleIcon className="h-8 w-8 text-danger" strokeWidth={1.5} />
      </div>
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-text-primary">{title}</h2>
        <p className="text-sm text-text-secondary max-w-xs">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-2 inline-flex items-center justify-center rounded-(--neu-radius-pill) bg-text-primary px-6 py-2.5 text-sm font-semibold text-text-inverse shadow-neu-control transition-all hover:shadow-neu-card active:shadow-neu-inset active:scale-[0.98]"
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
}
