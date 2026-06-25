"use client";

import { useState, useActionState } from "react";
import { CheckIcon, SaveIcon } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { Button } from "@/shared/ui/button";
import { saveAvailabilityAction } from "../actions/save-availability.action";
import type { DayRule } from "../actions/save-availability.action";
import type { ActionResult } from "@/lib/validators/common";

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon→Sun
const DAY_LABELS: Record<number, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};
const DAY_SHORT: Record<number, string> = {
  0: "Sun", 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat",
};

interface Host {
  id: string;
  display_name: string;
  host_slug: string;
}

interface ExistingRule {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

interface AvailabilityEditorProps {
  hosts: Host[];
  initialHostId: string;
  initialRules: ExistingRule[];
}

function buildInitialState(rules: ExistingRule[]): DayRule[] {
  return DAY_ORDER.map((day) => {
    const existing = rules.find((r) => r.day_of_week === day);
    return {
      day_of_week: day,
      enabled:    !!existing,
      start_time: existing ? existing.start_time.slice(0, 5) : "09:00",
      end_time:   existing ? existing.end_time.slice(0, 5) : "18:00",
    };
  });
}

export function AvailabilityEditor({
  hosts,
  initialHostId,
  initialRules,
}: AvailabilityEditorProps) {
  const [selectedHostId, setSelectedHostId] = useState(initialHostId);
  const [rules, setRules] = useState<DayRule[]>(() => buildInitialState(initialRules));
  const [saved, setSaved] = useState(false);

  const [state, formAction, isPending] = useActionState<ActionResult, FormData>(
    async (prev, fd) => {
      const result = await saveAvailabilityAction(prev, fd);
      if (!result.error) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
      return result;
    },
    {},
  );

  function toggleDay(day: number) {
    setRules((prev) =>
      prev.map((r) => (r.day_of_week === day ? { ...r, enabled: !r.enabled } : r)),
    );
  }

  function updateTime(day: number, field: "start_time" | "end_time", value: string) {
    setRules((prev) =>
      prev.map((r) => (r.day_of_week === day ? { ...r, [field]: value } : r)),
    );
  }

  async function handleHostChange(hostId: string) {
    setSelectedHostId(hostId);
    // Fetch rules for the newly selected host
    const res = await fetch(`/api/internal/booking/availability-rules?hostId=${hostId}`);
    if (res.ok) {
      const json = await res.json();
      setRules(buildInitialState(json.rules ?? []));
    } else {
      setRules(buildInitialState([]));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Host selector */}
      {hosts.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {hosts.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => handleHostChange(h.id)}
              className={cn(
                "px-4 py-1.5 rounded-full text-sm font-medium transition-all border",
                selectedHostId === h.id
                  ? "bg-surface-sunken border-border-strong text-text-primary shadow-neu-inset"
                  : "bg-surface border-border-soft text-text-secondary hover:border-border-strong",
              )}
            >
              {h.display_name}
            </button>
          ))}
        </div>
      )}

      {/* Working hours form */}
      <form
        action={formAction}
        className="rounded-(--neu-radius-lg) border border-border-soft bg-surface shadow-neu-card"
      >
        <input type="hidden" name="host_profile_id" value={selectedHostId} />
        <input type="hidden" name="rules" value={JSON.stringify(rules)} />

        <div className="p-5 border-b border-border-soft">
          <h2 className="text-base font-semibold text-text-primary">Working Hours</h2>
          <p className="text-xs text-text-muted mt-0.5">
            Toggle days and set working hours for the selected host
          </p>
        </div>

        <ul className="divide-y divide-border-soft">
          {rules.map((rule) => (
            <li
              key={rule.day_of_week}
              className={cn(
                "flex items-center gap-4 px-5 py-3.5 transition-colors",
                !rule.enabled && "opacity-50",
              )}
            >
              {/* Toggle */}
              <button
                type="button"
                onClick={() => toggleDay(rule.day_of_week)}
                aria-label={`Toggle ${DAY_LABELS[rule.day_of_week]}`}
                className={cn(
                  "relative shrink-0 w-10 rounded-full border transition-all",
                  "h-[22px]",
                  rule.enabled
                    ? "bg-accent-green border-accent-green"
                    : "bg-surface-sunken border-border-soft",
                )}
              >
                <span
                  className={cn(
                    "absolute top-[3px] left-[3px] w-4 h-4 rounded-full bg-white shadow-sm transition-transform",
                    rule.enabled && "translate-x-[18px]",
                  )}
                />
              </button>

              {/* Day name */}
              <span className="w-24 shrink-0 text-sm font-medium text-text-primary">
                <span className="hidden sm:inline">{DAY_LABELS[rule.day_of_week]}</span>
                <span className="sm:hidden">{DAY_SHORT[rule.day_of_week]}</span>
              </span>

              {/* Time pickers */}
              {rule.enabled ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="time"
                    value={rule.start_time}
                    onChange={(e) => updateTime(rule.day_of_week, "start_time", e.target.value)}
                    className="soft-control px-3 py-1.5 text-sm w-32"
                    aria-label={`${DAY_LABELS[rule.day_of_week]} start time`}
                  />
                  <span className="text-text-muted text-sm shrink-0">—</span>
                  <input
                    type="time"
                    value={rule.end_time}
                    onChange={(e) => updateTime(rule.day_of_week, "end_time", e.target.value)}
                    className="soft-control px-3 py-1.5 text-sm w-32"
                    aria-label={`${DAY_LABELS[rule.day_of_week]} end time`}
                  />
                </div>
              ) : (
                <span className="text-sm text-text-muted flex-1">Unavailable</span>
              )}
            </li>
          ))}
        </ul>

        <div className="p-5 border-t border-border-soft flex items-center justify-between gap-3">
          {state.error && (
            <p className="text-sm text-danger">{state.error}</p>
          )}
          {saved && !state.error && (
            <span className="flex items-center gap-1.5 text-sm text-accent-green">
              <CheckIcon className="h-4 w-4" />
              Saved
            </span>
          )}
          {!saved && !state.error && <div />}

          <Button type="submit" disabled={isPending} className="flex items-center gap-2">
            <SaveIcon className="h-4 w-4" />
            {isPending ? "Saving…" : "Save Schedule"}
          </Button>
        </div>
      </form>
    </div>
  );
}
