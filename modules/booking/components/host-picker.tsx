"use client";

import Image from "next/image";
import Link from "next/link";
import { UserCircleIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import type { PublicHostProfile } from "../hosts/types/booking-host.types";

interface HostPickerProps {
  hosts: PublicHostProfile[];
  organizationSlug: string;
  bookWithLabel: string;
}

export function HostPicker({
  hosts,
  organizationSlug,
  bookWithLabel,
}: HostPickerProps) {
  if (hosts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <UserCircleIcon className="h-12 w-12 text-text-muted" strokeWidth={1} />
        <p className="text-sm text-text-muted">No specialists available</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {hosts.map((host) => (
        <li key={host.slug}>
          <Link
            href={`/booking/${organizationSlug}/${host.slug}`}
            className={cn(
              "flex items-center gap-4 rounded-(--neu-radius-lg) bg-surface p-4",
              "border border-border-soft shadow-neu-card",
              "transition-all hover:shadow-neu-lg hover:border-border-strong",
              "active:shadow-neu-inset active:scale-[0.99]",
              "min-h-[72px]",
            )}
          >
            {/* Avatar */}
            <div className="shrink-0">
              {host.avatarUrl ? (
                <Image
                  src={host.avatarUrl}
                  alt={host.displayName}
                  width={48}
                  height={48}
                  className="h-12 w-12 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-sunken text-text-secondary text-lg font-semibold">
                  {host.displayName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-text-primary truncate">
                {host.displayName}
              </p>
              {host.publicTitle && (
                <p className="text-sm text-text-secondary truncate">
                  {host.publicTitle}
                </p>
              )}
              {host.publicBio && (
                <p className="mt-0.5 text-xs text-text-muted line-clamp-2">
                  {host.publicBio}
                </p>
              )}
            </div>

            {/* CTA */}
            <div className="shrink-0 flex items-center gap-1.5">
              <span className="hidden sm:inline text-sm font-medium text-text-secondary">
                {bookWithLabel}
              </span>
              <ChevronRightIcon className="h-5 w-5 text-text-muted" />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
