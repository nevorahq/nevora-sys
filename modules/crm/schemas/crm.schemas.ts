import { z } from "zod";
import {
  CLIENT_STATUSES, CLIENT_TYPES, CLIENT_SOURCES,
  ACTIVITY_TYPES, CRM_ENTITY_TYPES,
  CLIENT_NAME_MAX, DEAL_TITLE_MAX, NOTE_CONTENT_MAX, ACTIVITY_TITLE_MAX,
} from "../constants/crm.constants";

// ── Client ────────────────────────────────────────────────────────────────────

export const createClientSchema = z.object({
  name:        z.string().min(1, "Name is required").max(CLIENT_NAME_MAX),
  email:       z.string().email("Invalid email").nullable().default(null),
  phone:       z.string().max(50).nullable().default(null),
  website:     z.string().url("Invalid URL").nullable().default(null),
  company:     z.string().max(200).nullable().default(null),
  client_type: z.enum(CLIENT_TYPES).default("company"),
  status:      z.enum(CLIENT_STATUSES).default("lead"),
  source:      z.enum(CLIENT_SOURCES).default("manual"),
  description: z.string().max(2000).nullable().default(null),
  assigned_to: z.string().uuid().nullable().default(null),
});

export const updateClientSchema = createClientSchema.partial();

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;

// ── Contact ───────────────────────────────────────────────────────────────────

export const createContactSchema = z.object({
  client_id:  z.string().uuid().nullable().default(null),
  first_name: z.string().min(1, "First name is required").max(100),
  last_name:  z.string().max(100).nullable().default(null),
  email:      z.string().email("Invalid email").nullable().default(null),
  phone:      z.string().max(50).nullable().default(null),
  position:   z.string().max(100).nullable().default(null),
  is_primary: z.boolean().default(false),
});

export const updateContactSchema = createContactSchema.partial();

export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;

// ── Deal ──────────────────────────────────────────────────────────────────────

export const createDealSchema = z.object({
  title:               z.string().min(1, "Title is required").max(DEAL_TITLE_MAX),
  pipeline_id:         z.string().uuid("Invalid pipeline"),
  stage_id:            z.string().uuid("Invalid stage"),
  client_id:           z.string().uuid().nullable().default(null),
  value:               z.coerce.number().min(0).nullable().default(null),
  currency:            z.string().length(3).default("USD"),
  expected_close_date: z.string().nullable().default(null),
  assigned_to:         z.string().uuid().nullable().default(null),
});

export const updateDealSchema = createDealSchema
  .omit({ pipeline_id: true })
  .partial();

export const changeDealStageSchema = z.object({
  dealId:  z.string().uuid("Invalid deal ID"),
  stageId: z.string().uuid("Invalid stage ID"),
});

export const closeDealSchema = z.object({
  dealId:      z.string().uuid("Invalid deal ID"),
  outcome:     z.enum(["won", "lost"]),
  lost_reason: z.string().max(500).nullable().default(null),
});

export type CreateDealInput = z.infer<typeof createDealSchema>;
export type UpdateDealInput = z.infer<typeof updateDealSchema>;
export type ChangeDealStageInput = z.infer<typeof changeDealStageSchema>;
export type CloseDealInput = z.infer<typeof closeDealSchema>;

// ── Activity ──────────────────────────────────────────────────────────────────

export const createActivitySchema = z.object({
  entity_type:   z.enum(CRM_ENTITY_TYPES),
  entity_id:     z.string().uuid("Invalid entity ID"),
  activity_type: z.enum(ACTIVITY_TYPES),
  title:         z.string().min(1, "Title is required").max(ACTIVITY_TITLE_MAX),
  description:   z.string().max(2000).nullable().default(null),
  scheduled_at:  z.string().nullable().default(null),
});

export type CreateActivityInput = z.infer<typeof createActivitySchema>;

// ── Note ──────────────────────────────────────────────────────────────────────

export const createNoteSchema = z.object({
  entity_type: z.enum(CRM_ENTITY_TYPES),
  entity_id:   z.string().uuid("Invalid entity ID"),
  content:     z.string().min(1, "Note cannot be empty").max(NOTE_CONTENT_MAX),
});

export type CreateNoteInput = z.infer<typeof createNoteSchema>;

// ── Tag ───────────────────────────────────────────────────────────────────────

export const createTagSchema = z.object({
  name:  z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Invalid hex color").default("#6366f1"),
});

export type CreateTagInput = z.infer<typeof createTagSchema>;
