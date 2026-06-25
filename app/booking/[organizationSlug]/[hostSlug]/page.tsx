import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPublicHostBySlug, getPublicHostServices } from "@/modules/booking";
import { PublicBookingShell } from "@/modules/booking/components/public-booking-shell";
import { getDictionary } from "@/shared/i18n/get-dictionary";

interface PageProps {
  params: Promise<{ organizationSlug: string; hostSlug: string }>;
}

export default async function PublicHostBookingPage({ params }: PageProps) {
  const { organizationSlug, hostSlug } = await params;
  const { dict } = await getDictionary();

  const supabase = await createClient();

  // Загружаем через organization_slug — без JOIN с organizations (anon RLS)
  const { data: pageData } = await supabase
    .from("booking_pages")
    .select("title, default_timezone, organization_slug")
    .eq("organization_slug", organizationSlug)
    .eq("public_enabled", true)
    .maybeSingle();

  if (!pageData) notFound();

  // Load host profile
  const host = await getPublicHostBySlug(organizationSlug, hostSlug);
  if (!host) notFound();

  // Load host services
  const services = await getPublicHostServices(organizationSlug, hostSlug);

  const { booking: bookingDict } = dict;

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-lg px-4 py-6 sm:px-6">
        {/* Back to organization page */}
        <Link
          href={`/booking/${organizationSlug}`}
          className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors mb-6"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          {pageData.title}
        </Link>

        {/* Host profile card */}
        <div className="flex items-center gap-4 rounded-(--neu-radius-lg) bg-surface border border-border-soft shadow-neu-card p-4 mb-6">
          {host.avatarUrl ? (
            <Image
              src={host.avatarUrl}
              alt={host.displayName}
              width={56}
              height={56}
              className="h-14 w-14 rounded-full object-cover shrink-0"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-sunken text-text-secondary text-xl font-semibold shrink-0">
              {host.displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-text-primary truncate">
              {host.displayName}
            </h1>
            {host.publicTitle && (
              <p className="text-sm text-text-secondary truncate">{host.publicTitle}</p>
            )}
            {host.publicBio && (
              <p className="mt-1 text-xs text-text-muted line-clamp-2">{host.publicBio}</p>
            )}
          </div>
        </div>

        {/* Multi-step booking flow */}
        <PublicBookingShell
          organizationSlug={organizationSlug}
          host={host}
          services={services}
          defaultTimezone={pageData.default_timezone}
          labels={{
            chooseService:    bookingDict.public.chooseService,
            chooseDate:       bookingDict.public.chooseDate,
            chooseTime:       bookingDict.public.chooseTime,
            yourDetails:      bookingDict.public.yourDetails,
            bookWith:         bookingDict.public.bookWith,
            durationLabel:    bookingDict.public.durationLabel,
            stepOf:           bookingDict.public.stepOf,
            back:             bookingDict.public.back,
            noAvailableSlots: bookingDict.public.noAvailableSlots,
            successTitle:     bookingDict.public.successTitle,
            successMessage:   bookingDict.public.successMessage,
            errorTitle:       bookingDict.public.errorTitle,
            errorMessage:     bookingDict.public.errorMessage,
            namePlaceholder:  bookingDict.public.namePlaceholder,
            emailPlaceholder: bookingDict.public.emailPlaceholder,
            phonePlaceholder: bookingDict.public.phonePlaceholder,
            messagePlaceholder: bookingDict.public.messagePlaceholder,
            submitRequest:    bookingDict.public.submitRequest,
            submitting:       bookingDict.public.submitting,
          }}
        />
      </div>
    </main>
  );
}
