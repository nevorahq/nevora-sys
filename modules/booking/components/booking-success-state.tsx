import { CheckCircleIcon } from "lucide-react";

interface BookingSuccessStateProps {
  title: string;
  message: string;
}

export function BookingSuccessState({ title, message }: BookingSuccessStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-green-soft">
        <CheckCircleIcon className="h-8 w-8 text-accent-green" strokeWidth={1.5} />
      </div>
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-text-primary">{title}</h2>
        <p className="text-sm text-text-secondary max-w-xs">{message}</p>
      </div>
    </div>
  );
}
