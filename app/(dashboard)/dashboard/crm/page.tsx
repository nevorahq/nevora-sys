import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { assertPausedModuleEnabled } from "@/shared/config/paused-modules";
import {
  getClients,
  getContacts,
  getActivities,
  getDealsWithStages,
  getDefaultPipeline,
  getOrgMembers,
  CLIENT_STATUSES,
  DEAL_STATUSES,
  ACTIVITY_TYPES,
} from "@/modules/crm";
import type { ClientStatus, DealStatus, ActivityType } from "@/modules/crm";
import { CRMSectionTabs } from "@/features/crm/components/crm-section-tabs";
import type { CRMSection } from "@/features/crm/components/crm-section-tabs";
import { CRMToolbar } from "@/features/crm/components/crm-toolbar";
import { CRMDataTable } from "@/features/crm/components/crm-data-table";
import { CRMMobileList } from "@/features/crm/components/crm-mobile-list";
import { CRMPagination } from "@/features/crm/components/crm-pagination";

const PAGE_SIZE = 25;

const VALID_SECTIONS: CRMSection[] = [
  "leads", "contacts", "clients", "deals", "activities",
];

interface CrmPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function CrmPage({ searchParams }: CrmPageProps) {
  // CRM is a paused module for the private beta: block the route unless it has
  // been explicitly re-enabled for this environment.
  assertPausedModuleEnabled("crm");

  const params = await searchParams;

  const rawSection = typeof params.section === "string" ? params.section : "clients";
  const section: CRMSection = VALID_SECTIONS.includes(rawSection as CRMSection)
    ? (rawSection as CRMSection)
    : "clients";

  const search = typeof params.search === "string" ? params.search : "";
  const status = typeof params.status === "string" ? params.status : "";
  const owner  = typeof params.owner  === "string" ? params.owner  : "";
  const page   = Math.max(1, Number(params.page) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const hasFilters = Boolean(search || status || owner);

  const { org } = await requireOrg();

  // Ensure default pipeline exists (idempotent)
  const supabase = await createSupabaseClient();
  await supabase.rpc("create_default_crm_pipeline", { p_org_id: org.id });

  // Validate filter values against known constants
  const clientStatus = CLIENT_STATUSES.includes(status as ClientStatus)
    ? (status as ClientStatus)
    : undefined;
  const dealStatus = DEAL_STATUSES.includes(status as DealStatus)
    ? (status as DealStatus)
    : undefined;
  const activityType = ACTIVITY_TYPES.includes(status as ActivityType)
    ? (status as ActivityType)
    : undefined;

  // Owner filter: "__unassigned__" → assigned_to IS NULL; UUID → specific user
  const unassigned   = owner === "__unassigned__";
  const assignedToId = !unassigned && owner ? owner : undefined;

  // Fetch org members + active section data in parallel
  const [orgMembers, leadsData, clientsData, contactsData, dealsData, activitiesData] =
    await Promise.all([
      getOrgMembers(org.id),

      section === "leads"
        ? getClients(org.id, {
            status: "lead",
            search: search || undefined,
            assignedTo: assignedToId,
            unassigned,
            limit: PAGE_SIZE,
            offset,
          })
        : null,

      section === "clients"
        ? getClients(org.id, {
            status: clientStatus,
            search: search || undefined,
            assignedTo: assignedToId,
            unassigned,
            limit: PAGE_SIZE,
            offset,
          })
        : null,

      section === "contacts"
        ? getContacts(org.id, {
            search: search || undefined,
            limit: PAGE_SIZE,
            offset,
          })
        : null,

      section === "deals"
        ? getDefaultPipeline(org.id).then((pipeline) =>
            getDealsWithStages(org.id, {
              status: dealStatus,
              pipelineId: pipeline?.id,
              assignedTo: assignedToId,
              unassigned,
              limit: PAGE_SIZE,
              offset,
            }),
          )
        : null,

      section === "activities"
        ? getActivities(org.id, {
            activityType,
            search: search || undefined,
            limit: PAGE_SIZE,
            offset,
          })
        : null,
    ]);

  // Build members map: userId → displayName (for passing to client components)
  const membersMap: Record<string, string> = Object.fromEntries(
    orgMembers.map((m) => [m.id, m.displayName ?? "Member"]),
  );

  // totalCount approximation — avoids a separate COUNT query
  const rawCount = (leadsData ?? clientsData ?? contactsData ?? dealsData ?? activitiesData ?? [])
    .length;
  const totalCount = rawCount === PAGE_SIZE ? offset + PAGE_SIZE + 1 : offset + rawCount;

  return (
    <>
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">CRM</h1>
          <p className="mt-0.5 text-sm text-text-muted">
            Manage leads, clients, deals and activities
          </p>
        </div>
      </div>

      {/* Section tabs */}
      <div className="mt-6">
        <CRMSectionTabs activeSection={section} />
      </div>

      {/* Toolbar */}
      <div className="mt-4">
        <CRMToolbar
          section={section}
          currentSearch={search}
          currentStatus={status}
          currentOwner={owner}
          orgMembers={orgMembers}
        />
      </div>

      {/* Table — desktop */}
      <div className="mt-4 hidden sm:block" id={`crm-panel-${section}`} role="tabpanel">
        {section === "leads" && (
          <CRMDataTable section="leads" data={leadsData ?? []} hasFilters={hasFilters} membersMap={membersMap} />
        )}
        {section === "clients" && (
          <CRMDataTable section="clients" data={clientsData ?? []} hasFilters={hasFilters} membersMap={membersMap} />
        )}
        {section === "contacts" && (
          <CRMDataTable section="contacts" data={contactsData ?? []} hasFilters={hasFilters} />
        )}
        {section === "deals" && (
          <CRMDataTable section="deals" data={dealsData ?? []} hasFilters={hasFilters} membersMap={membersMap} />
        )}
        {section === "activities" && (
          <CRMDataTable section="activities" data={activitiesData ?? []} hasFilters={hasFilters} />
        )}
      </div>

      {/* Mobile list */}
      <div className="mt-4 sm:hidden" aria-label={`${section} list`}>
        {section === "leads" && (
          <CRMMobileList section="leads" data={leadsData ?? []} hasFilters={hasFilters} membersMap={membersMap} />
        )}
        {section === "clients" && (
          <CRMMobileList section="clients" data={clientsData ?? []} hasFilters={hasFilters} membersMap={membersMap} />
        )}
        {section === "contacts" && (
          <CRMMobileList section="contacts" data={contactsData ?? []} hasFilters={hasFilters} />
        )}
        {section === "deals" && (
          <CRMMobileList section="deals" data={dealsData ?? []} hasFilters={hasFilters} membersMap={membersMap} />
        )}
        {section === "activities" && (
          <CRMMobileList section="activities" data={activitiesData ?? []} hasFilters={hasFilters} />
        )}
      </div>

      {/* Pagination */}
      <CRMPagination
        section={section}
        currentSearch={search}
        currentStatus={status}
        currentOwner={owner}
        currentPage={page}
        totalCount={totalCount}
        pageSize={PAGE_SIZE}
      />
    </>
  );
}
