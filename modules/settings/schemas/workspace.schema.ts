import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "@/shared/config/currencies";

export const BUSINESS_TYPES = [
  "freelancer",
  "beauty_services",
  "small_business",
  "developer_agency",
  "other",
] as const;

export const workspaceSchema = z.object({
  organizationName: z.string().trim().min(1, "Organization name is required").max(100),
  workspaceName: z.string().trim().min(1, "Workspace name is required").max(100),
  businessType: z.enum(BUSINESS_TYPES),
  defaultCurrency: z.enum(SUPPORTED_CURRENCIES),
  defaultLanguage: z.enum(["en", "ru"]),
  timezone: z.string().trim().min(1).max(100),
});

export type WorkspaceInput = z.infer<typeof workspaceSchema>;
