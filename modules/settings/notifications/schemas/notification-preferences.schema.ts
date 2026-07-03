import { z } from "zod";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM format");
const timezone = z.string().min(1).max(100).refine((value) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}, "Select a valid IANA timezone");

export const notificationPreferencesSchema = z.object({
  browserNotificationsEnabled: z.boolean(),
  inAppSoundEnabled: z.boolean(),
  soundMode: z.enum(["all", "important", "off"]),
  soundVolume: z.number().min(0).max(1),
  quietHoursEnabled: z.boolean(),
  quietHoursStart: time,
  quietHoursEnd: time,
  timezone,
  taskRemindersEnabled: z.boolean(),
  subscriptionRemindersEnabled: z.boolean(),
  paymentRemindersEnabled: z.boolean(),
  documentReviewEnabled: z.boolean(),
  actionCenterEnabled: z.boolean(),
});

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(4096),
  expirationTime: z.number().nullable(),
  keys: z.object({
    p256dh: z.string().min(20).max(1024),
    auth: z.string().min(8).max(1024),
  }),
});
