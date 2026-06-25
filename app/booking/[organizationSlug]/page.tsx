import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPublicHosts, getPublicHostServices } from "@/modules/booking";
import { PublicOrganizationBooking } from "@/modules/booking/components/public-organization-booking";
import { getDictionary } from "@/shared/i18n/get-dictionary";

interface PageProps {
  params: Promise<{ organizationSlug: string }>;
}

export default async function PublicOrganizationBookingPage({ params }: PageProps) {
  const { organizationSlug } = await params;
  const { dict } = await getDictionary();

  // Загружаем booking page через organization_slug — без JOIN с organizations
  // (anon пользователь не может читать таблицу organizations через RLS)
  const supabase = await createClient();
  const { data: pageData } = await supabase
    .from("booking_pages")
    .select("title, description, default_timezone, organization_slug")
    .eq("organization_slug", organizationSlug)
    .eq("public_enabled", true)
    .maybeSingle();

  if (!pageData) {
    notFound();
  }

  const hosts = await getPublicHosts(organizationSlug);
  const hostsWithServices = await Promise.all(
    hosts.map(async (host) => ({
      ...host,
      services: await getPublicHostServices(organizationSlug, host.slug),
    })),
  );

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-lg px-4 py-8 sm:px-6">
        {/* Organization header */}
        <header className="mb-8 text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-text-primary text-text-inverse text-xl font-bold mb-4">
            {organizationSlug.charAt(0).toUpperCase()}
          </div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">
            {pageData.title}
          </h1>
          {pageData.description && (
            <p className="mt-2 text-sm text-text-secondary">
              {pageData.description}
            </p>
          )}
        </header>

        {/* Full booking flow: specialist → service → slot → request */}
        <section>
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">
            {dict.booking.public.chooseSpecialist}
          </h2>
          <PublicOrganizationBooking
            organizationSlug={organizationSlug}
            hosts={hostsWithServices}
            defaultTimezone={pageData.default_timezone}
            labels={{
              chooseSpecialist: dict.booking.public.chooseSpecialist,
              chooseService:    dict.booking.public.chooseService,
              chooseDate:       dict.booking.public.chooseDate,
              chooseTime:       dict.booking.public.chooseTime,
              yourDetails:      dict.booking.public.yourDetails,
              bookWith:         dict.booking.public.bookWith,
              durationLabel:    dict.booking.public.durationLabel,
              stepOf:           dict.booking.public.stepOf,
              back:             dict.booking.public.back,
              noAvailableSlots: dict.booking.public.noAvailableSlots,
              successTitle:     dict.booking.public.successTitle,
              successMessage:   dict.booking.public.successMessage,
              errorTitle:       dict.booking.public.errorTitle,
              errorMessage:     dict.booking.public.errorMessage,
              namePlaceholder:  dict.booking.public.namePlaceholder,
              emailPlaceholder: dict.booking.public.emailPlaceholder,
              phonePlaceholder: dict.booking.public.phonePlaceholder,
              messagePlaceholder: dict.booking.public.messagePlaceholder,
              submitRequest:    dict.booking.public.submitRequest,
              submitting:       dict.booking.public.submitting,
            }}
          />
        </section>
      </div>
    </main>
  );
}
