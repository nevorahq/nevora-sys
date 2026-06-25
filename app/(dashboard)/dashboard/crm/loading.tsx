function Bone({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`animate-pulse rounded-(--neu-radius-sm) bg-surface-sunken ${className ?? ""}`}
      style={style}
    />
  );
}

import type React from "react";

export default function CrmLoading() {
  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Bone className="h-7 w-10" />
          <Bone className="h-4 w-60" />
        </div>
      </div>

      {/* Section tabs */}
      <div className="mt-6 flex gap-1.5">
        {[80, 80, 68, 56, 80].map((w, i) => (
          <Bone key={i} className={`h-8 rounded-(--neu-radius-pill)`} style={{ width: w }} />
        ))}
      </div>

      {/* Toolbar */}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Bone className="h-9 flex-1" />
        <div className="flex gap-2">
          <Bone className="h-9 w-28" />
          <Bone className="h-9 w-28" />
          <Bone className="h-9 w-24 rounded-(--neu-radius-pill)" />
        </div>
      </div>

      {/* Table skeleton — desktop */}
      <div className="mt-4 hidden sm:block overflow-hidden rounded-(--neu-radius-lg) border border-border-soft bg-surface shadow-neu-sm">
        <div className="flex items-center gap-4 border-b border-border-soft bg-surface-sunken px-4 py-2.5">
          {[24, 120, 140, 100, 80, 100, 70, 80].map((w, i) => (
            <Bone key={i} className="h-3.5" style={{ width: w }} />
          ))}
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-border-soft px-4 py-3.5 last:border-0"
          >
            <Bone className="h-4 w-4 rounded" />
            <Bone className="h-4 w-32" />
            <Bone className="h-4 w-40" />
            <Bone className="h-4 w-24" />
            <Bone className="h-4 w-16" />
            <Bone className="h-4 w-24" />
            <Bone className="h-5 w-16 rounded-(--neu-radius-pill)" />
            <Bone className="h-4 w-20" />
          </div>
        ))}
      </div>

      {/* Card list skeleton — mobile */}
      <div className="mt-4 flex flex-col gap-2 sm:hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-(--neu-radius-lg) border border-border-soft bg-surface p-3.5 shadow-neu-sm"
          >
            <Bone className="h-4 w-4 shrink-0 rounded" />
            <div className="flex-1 space-y-1.5">
              <Bone className="h-4 w-3/4" />
              <Bone className="h-3 w-1/2" />
            </div>
            <Bone className="h-5 w-16 rounded-(--neu-radius-pill)" />
          </div>
        ))}
      </div>
    </>
  );
}
