// Types
export type {
  CrmPipeline, CrmPipelineStage, CrmPipelineWithStages,
  CrmClient, CrmClientWithContacts,
  CrmContact,
  CrmDeal, CrmDealWithStage,
  CrmActivity, CrmNote, CrmTag,
  CrmSummary,
} from "./types/crm.types";

// Constants
export {
  CLIENT_STATUSES, CLIENT_TYPES, CLIENT_SOURCES,
  DEAL_STATUSES, STAGE_TYPES, ACTIVITY_TYPES, CRM_ENTITY_TYPES,
  CLIENT_STATUS_LABELS, DEAL_STATUS_LABELS, ACTIVITY_TYPE_LABELS,
  CLIENT_NAME_MAX, DEAL_TITLE_MAX,
} from "./constants/crm.constants";
export type {
  ClientStatus, ClientType, ClientSource,
  DealStatus, StageType, ActivityType, CrmEntityType,
} from "./constants/crm.constants";

// Schemas
export {
  createClientSchema, updateClientSchema,
  createContactSchema, updateContactSchema,
  createDealSchema, updateDealSchema, changeDealStageSchema, closeDealSchema,
  createActivitySchema, createNoteSchema, createTagSchema,
} from "./schemas/crm.schemas";

// Queries
export { getOrgMembers } from "./queries/get-org-members";
export type { OrgMember } from "./queries/get-org-members";
export { getPipelinesWithStages, getDefaultPipeline } from "./queries/get-pipelines";
export { getClients, getClientById } from "./queries/get-clients";
export type { GetClientsOptions } from "./queries/get-clients";
export { getDeals, getDealsWithStages, getDealById } from "./queries/get-deals";
export type { GetDealsOptions } from "./queries/get-deals";
export { getContacts } from "./queries/get-contacts";
export type { GetContactsOptions } from "./queries/get-contacts";
export { getActivities } from "./queries/get-activities";
export type { GetActivitiesOptions } from "./queries/get-activities";
export { getCrmSummary } from "./queries/get-crm-summary";

// Actions
export { createClientAction } from "./actions/create-client.action";
export { updateClientAction } from "./actions/update-client.action";
export { deleteClientAction } from "./actions/delete-client.action";
export { createDealAction } from "./actions/create-deal.action";
export { changeDealStageAction } from "./actions/change-deal-stage.action";
export { closeDealAction } from "./actions/close-deal.action";
export { createContactAction } from "./actions/create-contact.action";
export { createActivityAction } from "./actions/create-activity.action";
export { createNoteAction } from "./actions/create-note.action";
