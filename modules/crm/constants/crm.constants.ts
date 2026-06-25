export const CLIENT_STATUSES = ["lead", "prospect", "customer", "churned"] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const CLIENT_TYPES = ["company", "individual"] as const;
export type ClientType = (typeof CLIENT_TYPES)[number];

export const CLIENT_SOURCES = ["manual", "import", "api", "form", "referral"] as const;
export type ClientSource = (typeof CLIENT_SOURCES)[number];

export const DEAL_STATUSES = ["open", "won", "lost"] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

export const STAGE_TYPES = ["open", "won", "lost"] as const;
export type StageType = (typeof STAGE_TYPES)[number];

export const ACTIVITY_TYPES = ["call", "email", "meeting", "task", "note"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const CRM_ENTITY_TYPES = ["client", "contact", "deal"] as const;
export type CrmEntityType = (typeof CRM_ENTITY_TYPES)[number];

// Field limits
export const CLIENT_NAME_MAX = 200;
export const DEAL_TITLE_MAX = 200;
export const NOTE_CONTENT_MAX = 10000;
export const ACTIVITY_TITLE_MAX = 200;

// Labels
export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  lead:     "Lead",
  prospect: "Prospect",
  customer: "Customer",
  churned:  "Churned",
};

export const DEAL_STATUS_LABELS: Record<DealStatus, string> = {
  open: "Open",
  won:  "Won",
  lost: "Lost",
};

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  call:    "Call",
  email:   "Email",
  meeting: "Meeting",
  task:    "Task",
  note:    "Note",
};
